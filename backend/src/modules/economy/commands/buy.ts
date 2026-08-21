import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
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

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Compra realizada")
      .setDescription(
        `Compraste **${result.item.icon} ${result.item.name}** por **${result.item.price.toLocaleString("es-MX")}** ${currency}.${statusNote}`,
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

    await interaction.editReply({ embeds: [embed] });
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
