import {
  EmbedBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import type { AntiRaidSettings } from "@adobos/shared";
import { logger } from "../../core/log.js";

const COLOR = 0xed4245;

export async function sendAntiRaidAlert(
  channel: GuildTextBasedChannel | null | undefined,
  title: string,
  description: string,
): Promise<void> {
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle(title)
          .setDescription(description.slice(0, 4096))
          .setTimestamp(new Date()),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error: unknown) {
    logger.warn({ err: error }, "anti-raid: alerta no enviada");
  }
}

export async function resolveAlertChannel(
  guild: { channels: { fetch: (id: string) => Promise<unknown> } },
  settings: AntiRaidSettings,
): Promise<GuildTextBasedChannel | null> {
  if (!settings.alertChannelId) return null;
  const channel = await guild.channels
    .fetch(settings.alertChannelId)
    .catch(() => null);
  if (
    channel &&
    typeof channel === "object" &&
    "isTextBased" in channel &&
    typeof (channel as GuildTextBasedChannel).isTextBased === "function" &&
    (channel as GuildTextBasedChannel).isTextBased() &&
    !(channel as GuildTextBasedChannel).isDMBased()
  ) {
    return channel as GuildTextBasedChannel;
  }
  return null;
}
