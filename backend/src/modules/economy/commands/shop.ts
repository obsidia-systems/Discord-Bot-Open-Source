import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import {
  ECONOMY_SHOP_REWARD_LABELS,
  type EconomyShopRewardType,
} from "@adobos/shared";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { getEconomyConfig } from "../service.js";
import { listShopItems } from "../shopService.js";

/**
 * /shop — lista el catálogo habilitado de la tienda.
 */
export async function handleShopCommand(
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

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply({ ephemeral });

  const items = listShopItems(interaction.guildId, { enabledOnly: true }).filter(
    (item) => item.stock === null || item.stock > 0,
  );

  if (items.length === 0) {
    await interaction.editReply({
      content:
        "La tienda está vacía por ahora. Un administrador puede añadir ítems en el panel.",
    });
    return;
  }

  const currency = economy.currencyName || "monedas";
  const embeds = items.slice(0, 10).map((item) => {
    const stockLabel =
      item.stock === null ? "∞" : String(item.stock);
    const typeLabel =
      ECONOMY_SHOP_REWARD_LABELS[item.rewardType as EconomyShopRewardType] ??
      item.rewardType;

    return new EmbedBuilder()
      .setColor(0xe11d48)
      .setTitle(`${item.icon} ${item.name}`)
      .setDescription(item.description || "Sin descripción.")
      .addFields(
        {
          name: "Precio",
          value: `**${item.price.toLocaleString("es-MX")}** ${currency}`,
          inline: true,
        },
        { name: "Stock", value: stockLabel, inline: true },
        { name: "Tipo", value: typeLabel, inline: true },
        {
          name: "Comprar",
          value: `\`/buy item:${item.id}\``,
          inline: false,
        },
      );
  });

  const extra =
    items.length > 10
      ? `\n_…y ${items.length - 10} ítems más._`
      : "";

  await interaction.editReply({
    content: `🛒 **Tienda de ${interaction.guild.name}**${extra}`,
    embeds,
  });
}
