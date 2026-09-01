import { EmbedBuilder, type Client, type User } from "discord.js";
import { sendActionLogWebhook } from "../action-logs/webhooks.js";
import { resolveAutoModLogChannelId } from "./service.js";
import { logger } from "../../core/log.js";

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
    input.content.trim().slice(0, 1000) || "(sin texto / solo adjuntos)";
  const quoted =
    raw
      .split("\n")
      .map((line) => `> ${line || "\u200b"}`)
      .join("\n")
      .slice(0, 1024) || "> —";

  const headline = input.nativeBlock
    ? "**Mensaje bloqueado** por AutoMod nativo de Discord (Adobos)."
    : "**Mensaje eliminado automáticamente** por Auto-Mod.";

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setAuthor({
      name: `${author.tag} (ID: ${author.id})`,
      iconURL: author.displayAvatarURL({ size: 128 }),
    })
    .setDescription(headline)
    .addFields(
      {
        name: "Canal",
        value: input.channelId ? `<#${input.channelId}>` : "—",
        inline: true,
      },
      {
        name: "Filtro detonado",
        value: input.filterLabel,
        inline: true,
      },
      {
        name: "Contenido original",
        value: quoted,
        inline: false,
      },
    )
    .setFooter({
      text: `Afectado ID: ${author.id}${input.messageId ? ` • Msg ID: ${input.messageId}` : ""}`,
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
    logger.warn({ err: error }, "auto-mod: no se pudo enviar alerta:");
  }
}
