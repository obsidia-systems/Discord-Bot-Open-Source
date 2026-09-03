import { type Client, EmbedBuilder, type User } from "discord.js";
import { logger } from "#core/log.js";
import { sendActionLogWebhook } from "#modules/action-logs/webhooks.js";
import { resolveAutoModLogChannelId } from "./domain/auto-mod.js";

export interface AutoModAlertInput {
  guildId: string;
  channelId: string | null;
  user: User;
  filterLabel: string;
  content: string;
  messageId?: string | null;
  /** Discord ya bloqueó el mensaje (no hubo flash). */
  nativeBlock?: boolean;
}

/**
 * Despacha alerta de seguridad (rojo) por cascada de canales.
 * Auto Mod logChannelId → Action Logs global → abort.
 */
export async function dispatchAutoModAlert(
  bot: Client,
  input: AutoModAlertInput,
): Promise<void> {
  const channelId = await resolveAutoModLogChannelId(input.guildId);
  if (!channelId) return;

  const author = input.user;
  const raw =
    input.content.trim().slice(0, 1000) || "(no text / attachments only)";
  const quoted =
    raw
      .split("\n")
      .map((line) => `> ${line || "\u200b"}`)
      .join("\n")
      .slice(0, 1024) || "> —";

  const headline = input.nativeBlock
    ? "**Message blocked** by Discord native AutoMod (Adobos)."
    : "**Message deleted automatically** by Auto-Mod.";

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setAuthor({
      name: `${author.tag} (ID: ${author.id})`,
      iconURL: author.displayAvatarURL({ size: 128 }),
    })
    .setDescription(headline)
    .addFields(
      {
        name: "Channel",
        value: input.channelId ? `<#${input.channelId}>` : "—",
        inline: true,
      },
      {
        name: "Triggered filter",
        value: input.filterLabel,
        inline: true,
      },
      {
        name: "Original content",
        value: quoted,
        inline: false,
      },
    )
    .setFooter({
      text: `Affected ID: ${author.id}${input.messageId ? ` • Msg ID: ${input.messageId}` : ""}`,
      iconURL: author.displayAvatarURL({ size: 64 }),
    })
    .setTimestamp(new Date());

  try {
    await sendActionLogWebhook(bot, {
      guildId: input.guildId,
      channelId,
      embeds: [embed],
    });
  } catch (error) {
    logger.warn({ err: error }, "auto-mod: couldn't send alert:");
  }
}
