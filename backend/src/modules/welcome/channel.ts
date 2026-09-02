import type { Channel, Client, SendableChannels } from "discord.js";
import { isWelcomeSendChannelType } from "@adobos/shared";
import { HttpError } from "../../core/http/httpError.js";

export function isWelcomeSendChannel(
  channel: unknown,
): channel is SendableChannels {
  if (!channel || typeof channel !== "object") return false;
  const typed = channel as { type?: number; send?: unknown };
  if (typeof typed.type !== "number" || !isWelcomeSendChannelType(typed.type)) {
    return false;
  }
  return typeof typed.send === "function";
}

export async function assertGuildWelcomeChannel(
  bot: Client,
  guildId: string,
  channelId: string,
): Promise<void> {
  if (!bot.isReady()) {
    throw new HttpError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }

  let channel: Channel | null;
  try {
    channel = await bot.channels.fetch(channelId);
  } catch {
    throw new HttpError(
      "No se pudo obtener el canal. Verifica el ID y los permisos del bot.",
      404,
      "CHANNEL_FETCH_FAILED",
    );
  }

  if (!channel) {
    throw new HttpError("Canal no encontrado.", 404, "CHANNEL_NOT_FOUND");
  }

  const channelGuildId =
    "guildId" in channel && typeof channel.guildId === "string"
      ? channel.guildId
      : null;
  if (!channelGuildId || channelGuildId !== guildId) {
    throw new HttpError(
      "El canal no pertenece a este servidor.",
      403,
      "CHANNEL_GUILD_MISMATCH",
    );
  }

  if (!isWelcomeSendChannel(channel)) {
    throw new HttpError(
      "El canal no admite mensajes de texto.",
      400,
      "CHANNEL_NOT_TEXT",
    );
  }
}
