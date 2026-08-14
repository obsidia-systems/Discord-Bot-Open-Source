import type { Client, Message, OmitPartialGroupDMChannel } from "discord.js";
import { executeModAction } from "../moderation/service.js";
import { evaluateAutoModFilters } from "./filters.js";
import { dispatchAutoModAlert } from "./logs.js";
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
  if (!message.guild || message.author.bot) return;
  if (!message.channel.isTextBased()) return;

  const guildId = message.guild.id;
  const config = getAutoModConfigCached(guildId);
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

  const content = message.content ?? "";
  const mentionCount =
    message.mentions.users.size +
    message.mentions.roles.size +
    (message.mentions.everyone ? 1 : 0);

  const violation = evaluateAutoModFilters({
    filters: config.filters,
    content,
    mentionCount,
    guildId,
    userId: message.author.id,
  });
  if (!violation) return;

  // 1) Mitigación: borrar mensaje
  await message.delete().catch(() => {});

  const reason = `[AutoMod] Infracción de filtro: ${violation.label}`;

  // 2) Warn en expediente histórico (tabla warnings)
  try {
    await executeModAction(message.client as Client, {
      action: "warn",
      guildId: message.guild.id,
      userId: message.author.id,
      reason,
      dmMode: "text",
      dmText: [
        `Has recibido un **Warn automático** en {server} por el sistema Auto Mod.`,
        ``,
        `Filtro: ${violation.label}`,
        `Razón: {reason}`,
        ``,
        `Si crees que es un error, contacta al staff del servidor.`,
      ].join("\n"),
    });
  } catch (error) {
    console.warn("[adobos] auto-mod: no se pudo registrar warn:", error);
  }

  // 3) Alerta de seguridad (cascada de canales)
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
