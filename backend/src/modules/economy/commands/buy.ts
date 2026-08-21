import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { resolveEmbedMedia } from "../../../lib/embedMedia.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { EconomyError, getEconomyConfig } from "../service.js";
import { purchaseShopItem } from "../purchaseService.js";

/**
 * /buy item:<id> — compra un ítem de la tienda.
 */
export async function handleBuyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const economy = getEconomyConfig(interaction.guildId);
  if (!economy.isActive) {
    await interaction.reply({
      content: "La economía está pausada en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const itemId = interaction.options.getString("item", true).trim();
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply({ ephemeral });

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    await interaction.editReply({
      content: "No se pudo resolver tu membresía en el servidor.",
    });
    return;
  }

  try {
    const result = await purchaseShopItem(
      interaction.guild,
      member,
      itemId,
    );
    const currency = economy.currencyName || "monedas";
    const statusNote =
      result.status === "pending"
        ? "\n\nEl staff ha sido notificado para completar tu pedido."
        : "";

    const icon = (result.item.icon || "").trim();
    const isImage =
      icon.startsWith("/uploads/") ||
      icon.startsWith("http://") ||
      icon.startsWith("https://");
    const itemLabel = isImage
      ? `**${result.item.name}**`
      : `**${icon} ${result.item.name}**`.trim();

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Compra realizada")
      .setDescription(
        `Compraste ${itemLabel} por **${result.item.price.toLocaleString("es-MX")}** ${currency}.${statusNote}`,
      )
      .addFields(
        {
          name: "Cartera",
          value: `\`${result.wallet.toLocaleString("es-MX")}\``,
          inline: true,
        },
        {
          name: "Banco",
          value: `\`${result.bank.toLocaleString("es-MX")}\``,
          inline: true,
        },
      )
      .setFooter({ text: `ID compra: ${result.purchaseId}` })
      .setTimestamp(new Date());

    const files = [];
    if (isImage) {
      try {
        const resolved = resolveEmbedMedia(icon, "icon", "buy-icon");
        if (resolved.url) embed.setThumbnail(resolved.url);
        if (resolved.file) files.push(resolved.file);
      } catch {
        /* sin thumbnail */
      }
    }

    await interaction.editReply({ embeds: [embed], files });
  } catch (error) {
    const message =
      error instanceof EconomyError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo completar la compra.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
