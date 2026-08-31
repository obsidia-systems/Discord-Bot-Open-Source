import type { Client, Message, OmitPartialGroupDMChannel } from "discord.js";
import { executeModAction } from "../moderation/service.js";
import { evaluateAutoModFilters } from "./filters.js";
import { dispatchAutoModAlert } from "./logs.js";
import { applyAutoModPunishments } from "./punishments.js";
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

export async function onAutoModMessageCreate(
  message: Message | GuildMessage,
): Promise<void> {
  try {
    await handleAutoModMessage(message);
  } catch (error) {
    console.warn("[adobos] auto-mod messageCreate falló:", error);
  }
}

async function handleAutoModMessage(
  message: Message | GuildMessage,
): Promise<void> {
  // 1) Exclusiones
  if (!message.guild || message.author.bot) return;
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

  // 3) Mitigación: delete + warn + sanciones escaladas + log
  await message.delete().catch(() => {});

  const reason = `[AutoMod] Filtro detonado: ${violation.label}`;
  const guildName = message.guild.name;

  try {
    await executeModAction(message.client as Client, {
      action: "warn",
      guildId: message.guild.id,
      userId: message.author.id,
      reason,
      dmMode: "text",
      dmText: `Tu mensaje en el servidor **${guildName}** fue eliminado por el filtro de Auto Mod (Razón: ${violation.label}).`,
    });
  } catch (error) {
    console.warn("[adobos] auto-mod: no se pudo registrar warn:", error);
  }

  void applyAutoModPunishments({
    client: message.client as Client,
    guildId,
    member,
    config,
  }).catch((error) => {
    console.warn("[adobos] auto-mod: sanción escalada falló:", error);
  });

  await dispatchAutoModAlert(message.client as Client, {
    guildId,
    message: message as Message,
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
}
