import { EmbedBuilder, type Client, type Message } from "discord.js";
import { sendActionLogWebhook } from "../action-logs/webhooks.js";
import { resolveAutoModLogChannelId } from "./service.js";

/**
 * Despacha alerta de seguridad (rojo) por cascada de canales.
 * Auto Mod logChannelId → Action Logs global → abort.
 */
export async function dispatchAutoModAlert(
  bot: Client,
  input: {
    guildId: string;
    message: Message;
    filterLabel: string;
    content: string;
  },
): Promise<void> {
  const channelId = resolveAutoModLogChannelId(input.guildId);
  if (!channelId) return;

  const author = input.message.author;
  const content =
    input.content.trim().slice(0, 900) || "(sin texto / solo adjuntos)";

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setAuthor({
      name: `${author.tag} (ID: ${author.id})`,
      iconURL: author.displayAvatarURL({ size: 128 }),
    })
    .setDescription(`🚨 **Auto Mod — infracción detectada**`)
    .addFields(
      {
        name: "Filtro",
        value: input.filterLabel,
        inline: true,
      },
      {
        name: "Canal",
        value: input.message.channelId
          ? `<#${input.message.channelId}>`
          : "—",
        inline: true,
      },
      {
        name: "Afectado",
        value: `<@${author.id}>`,
        inline: true,
      },
      {
        name: "Contenido original",
        value:
          content
            .split("\n")
            .map((line) => `> ${line || "\u200b"}`)
            .join("\n")
            .slice(0, 1024) || "> —",
        inline: false,
      },
    )
    .setFooter({
      text: `Afectado ID: ${author.id} • Msg ID: ${input.message.id}`,
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
    console.warn("[adobos] auto-mod: no se pudo enviar alerta:", error);
  }
}
