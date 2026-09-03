import {
  type AutoModerationActionExecution,
  type Client,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
  type PartialMessage,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../core/log.js";
import { enforceAutoModHit } from "./enforce.js";
import { evaluateAutoModFilters } from "./filters.js";
import { nativeRuleKeyFromName } from "./nativeRules.js";
import { getAutoModConfigCached } from "./service.js";

type GuildMessage = OmitPartialGroupDMChannel<Message<true>>;

function isChannelIgnored(
  ignored: string[],
  channelId: string | null,
  parentId: string | null,
): boolean {
  if (channelId && ignored.includes(channelId)) return true;
  if (parentId && ignored.includes(parentId)) return true;
  return false;
}

function isStaffMember(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  );
}

async function resolveFullMessage(
  message: Message | PartialMessage | GuildMessage,
): Promise<Message | null> {
  if (message.partial) {
    return await message.fetch().catch(() => null);
  }
  return message as Message;
}

export async function onAutoModMessageCreate(
  message: Message | GuildMessage,
): Promise<void> {
  try {
    const resolved = await resolveFullMessage(message);
    if (!resolved) return;
    await handleAutoModMessage(resolved);
  } catch (error) {
    logger.warn({ err: error }, "auto-mod messageCreate failed:");
  }
}

export async function onAutoModMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  try {
    const resolved = await resolveFullMessage(newMessage);
    if (!resolved) return;
    const oldContent = oldMessage.partial ? null : oldMessage.content;
    if (oldContent !== null && oldContent === resolved.content) return;
    await handleAutoModMessage(resolved);
  } catch (error) {
    logger.warn({ err: error }, "auto-mod messageUpdate failed:");
  }
}

async function handleAutoModMessage(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (message.system || message.webhookId) return;
  if (!message.channel.isTextBased()) return;

  const guildId = message.guild.id;
  const config = await getAutoModConfigCached(guildId);
  if (!config.enabled) return;

  const parentId =
    message.channel && "parentId" in message.channel
      ? message.channel.parentId
      : null;

  if (
    isChannelIgnored(
      config.ignoredChannels,
      message.channelId,
      parentId ?? null,
    )
  ) {
    return;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  if (
    config.ignoredRoles.length > 0 &&
    member.roles.cache.some((role) => config.ignoredRoles.includes(role.id))
  ) {
    return;
  }

  if (config.skipStaff && isStaffMember(member)) return;

  const content = message.content ?? "";
  const violation = evaluateAutoModFilters({
    filters: config.filters,
    content,
    mentionCount: message.mentions.users.size,
    guildId,
    userId: message.author.id,
    attachmentUrls: message.attachments.map((a) => a.url),
  });
  if (!violation) return;

  await enforceAutoModHit({
    client: message.client as Client,
    guildId,
    guildName: message.guild.name,
    member,
    user: message.author,
    config,
    filterKey: violation.key,
    content,
    channelId: message.channelId,
    messageId: message.id,
    messageToDelete: message,
  });
}

export async function onAutoModNativeExecution(
  execution: AutoModerationActionExecution,
): Promise<void> {
  try {
    const rule =
      execution.autoModerationRule ??
      (await execution.guild.autoModerationRules
        .fetch(execution.ruleId)
        .catch(() => null));
    const filterKey = nativeRuleKeyFromName(rule?.name ?? "");
    if (!filterKey) return;

    const user = execution.user;
    if (!user || user.bot) return;

    const guild = execution.guild;
    const config = await getAutoModConfigCached(guild.id);
    if (!config.enabled) return;

    if (
      isChannelIgnored(
        config.ignoredChannels,
        execution.channelId,
        execution.channel && "parentId" in execution.channel
          ? execution.channel.parentId
          : null,
      )
    ) {
      return;
    }

    const member =
      execution.member ??
      (await guild.members.fetch(execution.userId).catch(() => null));
    if (!member) return;

    if (
      config.ignoredRoles.length > 0 &&
      member.roles.cache.some((role) => config.ignoredRoles.includes(role.id))
    ) {
      return;
    }

    if (config.skipStaff && isStaffMember(member)) return;

    await enforceAutoModHit({
      client: guild.client,
      guildId: guild.id,
      guildName: guild.name,
      member,
      user,
      config,
      filterKey,
      content: execution.content || execution.matchedContent || "",
      channelId: execution.channelId,
      messageId: execution.messageId,
      nativeBlock: true,
    });
  } catch (error) {
    logger.warn({ err: error }, "auto-mod native execution failed:");
  }
}

export function registerAutoModListeners(ctx: {
  on: <K extends keyof import("discord.js").ClientEvents>(
    event: K,
    handler: (...args: import("discord.js").ClientEvents[K]) => void,
  ) => void;
}): void {
  ctx.on("messageCreate", (message) => {
    void onAutoModMessageCreate(message);
  });
  ctx.on("messageUpdate", (oldMessage, newMessage) => {
    void onAutoModMessageUpdate(oldMessage, newMessage);
  });
  ctx.on("autoModerationActionExecution", (execution) => {
    void onAutoModNativeExecution(execution);
  });
}
