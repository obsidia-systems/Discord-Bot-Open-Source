import {
  PermissionFlagsBits,
  type Client,
  type GuildMember,
  type Message,
  type OmitPartialGroupDMChannel,
  type PartialMessage,
} from "discord.js";
import { executeModAction } from "../moderation/service.js";
import { evaluateAutoModFilters } from "./filters.js";
import { dispatchAutoModAlert } from "./logs.js";
import { applyAutoModPunishments } from "./punishments.js";
import { getAutoModConfigCached } from "./service.js";
import { logger } from "../../core/log.js";

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
    logger.warn({ err: error }, "auto-mod messageCreate falló:");
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
    logger.warn({ err: error }, "auto-mod messageUpdate falló:");
  }
}

async function handleAutoModMessage(message: Message): Promise<void> {
  // 1) Exclusiones
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

  // 2) Heurística (un solo filtro por mensaje)
  const content = message.content ?? "";
  const mentionCount = message.mentions.users.size;
  const attachmentUrls = message.attachments.map((a) => a.url);

  const violation = evaluateAutoModFilters({
    filters: config.filters,
    content,
    mentionCount,
    guildId,
    userId: message.author.id,
    attachmentUrls,
  });
  if (!violation) return;

  // 3) Mitigación: delete + warn opcional + sanciones escaladas + log
  await message.delete().catch(() => {});

  const reason = `[AutoMod] Filtro detonado: ${violation.label}`;
  const guildName = message.guild.name;

  let warned = false;
  if (config.warnOnHit) {
    try {
      await executeModAction(message.client as Client, {
        action: "warn",
        guildId: message.guild.id,
        userId: message.author.id,
        reason,
        dmMode: config.dmOnHit ? "text" : "none",
        dmText: config.dmOnHit
          ? `Tu mensaje en el servidor **${guildName}** fue eliminado por el filtro de Auto Mod (Razón: ${violation.label}).`
          : undefined,
      });
      warned = true;
    } catch (error) {
      logger.warn({ err: error }, "auto-mod: no se pudo registrar warn:");
    }
  }

  if (warned) {
    await applyAutoModPunishments({
      client: message.client as Client,
      guildId,
      member,
      config,
    }).catch((error) => {
      logger.warn({ err: error }, "auto-mod: sanción escalada falló:");
    });
  }

  await dispatchAutoModAlert(message.client as Client, {
    guildId,
    message,
    filterLabel: violation.label,
    content,
  });
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
}
