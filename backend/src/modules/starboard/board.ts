import {
  ChannelType,
  DiscordAPIError,
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type TextChannel,
} from "discord.js";
import {
  countUniqueStarUsers,
  decideStarboardAction,
  isConfiguredStarEmoji,
  shouldSkipStarboardSource,
  starboardHeaderEmoji,
  type StarboardSettings,
} from "@adobos/shared";
import { toEmojiKey } from "../../db/reaction-roles.js";
import { logger } from "../../core/log.js";
import {
  deleteStarboardPost,
  getPostByOriginal,
  getPostByStarboardMessage,
  getStarboardSettings,
  upsertStarboardPost,
} from "./service.js";

const BOARD_COLOR = 0xffac33;
const BOARD_PERMS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.ReadMessageHistory;

const queues = new Map<string, Promise<void>>();

function enqueue(key: string, task: () => Promise<void>): void {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev
    .then(task, task)
    .catch((error: unknown) => {
      logger.warn({ err: error }, "starboard: queue failed");
    })
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  queues.set(key, next);
}

function isUnknownDiscord(error: unknown): boolean {
  if (!(error instanceof DiscordAPIError)) return false;
  const code = Number(error.code);
  return code === 10008 || code === 10003 || code === 50001;
}

async function resolveMessage(
  message: Message | PartialMessage,
): Promise<Message | null> {
  if (!message.partial) return message;
  try {
    return await message.fetch();
  } catch (error: unknown) {
    logger.warn({ err: error }, "starboard: couldn't fetch the message");
    return null;
  }
}

async function resolveReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction | null> {
  if (!reaction.partial) return reaction;
  try {
    return await reaction.fetch();
  } catch (error: unknown) {
    logger.warn({ err: error }, "starboard: couldn't fetch the reaction");
    return null;
  }
}

async function destinationChannel(
  message: Message,
  channelId: string,
): Promise<TextChannel | null> {
  const guild = message.guild;
  if (!guild) return null;
  const cached = guild.channels.cache.get(channelId);
  const channel =
    cached ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    return null;
  }
  if (!channel.isTextBased() || channel.isDMBased()) return null;
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (me && !channel.permissionsFor(me)?.has(BOARD_PERMS)) {
    logger.warn(
      { guildId: guild.id, channelId },
      "starboard: missing permissions in the board channel",
    );
    return null;
  }
  return channel as TextChannel;
}

function firstImageUrl(message: Message): string | null {
  for (const file of message.attachments.values()) {
    if (file.contentType?.startsWith("image/")) return file.url;
    if (/\.(png|jpe?g|gif|webp)$/i.test(file.name ?? "")) return file.url;
  }
  for (const embed of message.embeds) {
    if (embed.image?.url) return embed.image.url;
  }
  return null;
}

function buildBoardPayload(
  message: Message,
  settings: StarboardSettings,
  starCount: number,
): { content: string; embeds: EmbedBuilder[] } {
  const emoji = starboardHeaderEmoji(settings.emojis);
  const description = message.content?.trim()
    ? message.content.slice(0, 4096)
    : "\u200b";
  const authorName =
    message.member?.displayName ?? message.author.displayName ?? "User";
  const embed = new EmbedBuilder()
    .setColor(BOARD_COLOR)
    .setAuthor({
      name: authorName.slice(0, 256),
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(description)
    .setFooter({ text: `ID ${message.id}` })
    .setTimestamp(message.createdAt)
    .addFields({
      name: "Message",
      value: `[Go to original](${message.url})`,
    });
  const image = firstImageUrl(message);
  if (image) embed.setImage(image);

  return {
    content: `${emoji} **${starCount}** · <#${message.channelId}>`,
    embeds: [embed],
  };
}

async function countStars(
  message: Message,
  settings: StarboardSettings,
): Promise<number> {
  const collected: Array<{ id: string; bot: boolean }> = [];
  for (const reaction of message.reactions.cache.values()) {
    const key = toEmojiKey({
      id: reaction.emoji.id,
      name: reaction.emoji.name,
    });
    if (!isConfiguredStarEmoji(key, settings.emojis)) continue;
    const users = await reaction.users.fetch().catch(() => null);
    if (!users) continue;
    for (const user of users.values()) {
      collected.push({ id: user.id, bot: user.bot });
    }
  }
  return countUniqueStarUsers(collected, {
    authorId: message.author.id,
    allowSelfStar: settings.allowSelfStar,
    allowBots: settings.allowBots,
  });
}

async function applyToMessage(message: Message): Promise<void> {
  const guildId = message.guildId;
  if (!guildId || message.system) return;

  const byBoard = await getPostByStarboardMessage(message.id);
  if (byBoard) return;

  const settings = await getStarboardSettings(guildId);
  const skip = shouldSkipStarboardSource({
    enabled: settings.enabled,
    destinationChannelId: settings.channelId,
    sourceChannelId: message.channelId,
    ignoreChannelIds: settings.ignoreChannelIds,
    authorIsBot: Boolean(message.author.bot || message.webhookId),
    allowBots: settings.allowBots,
    sourceIsStarboardPost: false,
  });
  if (skip || !settings.channelId) return;

  const existing = await getPostByOriginal(message.id);
  const starCount = await countStars(message, settings);
  const action = decideStarboardAction({
    count: starCount,
    threshold: settings.threshold,
    alreadyPosted: Boolean(existing),
  });
  if (action === "noop") return;

  const board = await destinationChannel(message, settings.channelId);
  if (!board) return;

  if (action === "remove") {
    if (existing) {
      const posted = await board.messages
        .fetch(existing.starboardMessageId)
        .catch(() => null);
      if (posted) await posted.delete().catch(() => undefined);
      await deleteStarboardPost(message.id, guildId);
    }
    return;
  }

  const payload = buildBoardPayload(message, settings, starCount);
  const sendOpts = {
    content: payload.content,
    embeds: payload.embeds,
    allowedMentions: { parse: [] as const },
  };

  if (action === "update" && existing) {
    const posted = await board.messages
      .fetch(existing.starboardMessageId)
      .catch((error: unknown) => {
        if (isUnknownDiscord(error)) return null;
        throw error;
      });
    if (posted) {
      await posted.edit(sendOpts);
      await upsertStarboardPost({
        originalMessageId: message.id,
        guildId,
        channelId: message.channelId,
        starboardMessageId: posted.id,
        starCount,
      });
      return;
    }
  }

  const posted = await board.send(sendOpts);
  try {
    await upsertStarboardPost({
      originalMessageId: message.id,
      guildId,
      channelId: message.channelId,
      starboardMessageId: posted.id,
      starCount,
    });
  } catch (error: unknown) {
    await posted.delete().catch(() => undefined);
    throw error;
  }
}

export function syncStarboardMessage(message: Message | PartialMessage): void {
  const id = message.id;
  enqueue(id, async () => {
    const full = await resolveMessage(message);
    if (!full) return;
    await applyToMessage(full);
  });
}

export function syncStarboardReaction(
  reaction: MessageReaction | PartialMessageReaction,
): void {
  enqueue(`r:${reaction.message.id}`, async () => {
    const fullReaction = await resolveReaction(reaction);
    if (!fullReaction) return;
    const guildId = fullReaction.message.guildId;
    if (!guildId) return;
    const settings = await getStarboardSettings(guildId);
    const key = toEmojiKey({
      id: fullReaction.emoji.id,
      name: fullReaction.emoji.name,
    });
    if (!isConfiguredStarEmoji(key, settings.emojis)) return;
    const full = await resolveMessage(fullReaction.message);
    if (!full) return;
    await applyToMessage(full);
  });
}

export async function onStarboardMessageDelete(
  message: Message | PartialMessage,
): Promise<void> {
  const byBoard = await getPostByStarboardMessage(message.id);
  if (byBoard) {
    await deleteStarboardPost(byBoard.originalMessageId, byBoard.guildId);
    return;
  }
  const byOriginal = await getPostByOriginal(message.id);
  if (!byOriginal) return;
  const guild = message.guild;
  const channelId = (await getStarboardSettings(byOriginal.guildId)).channelId;
  if (guild && channelId) {
    const channel = guild.channels.cache.get(channelId);
    if (channel?.isTextBased() && "messages" in channel) {
      const posted = await channel.messages
        .fetch(byOriginal.starboardMessageId)
        .catch(() => null);
      if (posted) await posted.delete().catch(() => undefined);
    }
  }
  await deleteStarboardPost(byOriginal.originalMessageId, byOriginal.guildId);
}
