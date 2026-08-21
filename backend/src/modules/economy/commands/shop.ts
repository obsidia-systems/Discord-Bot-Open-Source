import type { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { summarizeShopRewards } from "@adobos/shared";
import { resolveEmbedMedia } from "../../../lib/embedMedia.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { getEconomyConfig } from "../service.js";
import { listShopItems } from "../shopService.js";

function isImageIcon(icon: string): boolean {
  const s = icon.trim();
  return (
    s.startsWith("/uploads/") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

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
  const files: AttachmentBuilder[] = [];
  const embeds = items.slice(0, 10).map((item, index) => {
    const stockLabel = item.stock === null ? "∞" : String(item.stock);
    const summary = summarizeShopRewards(item.rewards);
    const rewards =
      summary.length > 0 ? summary.map((s) => `• ${s}`).join("\n") : "—";

    const embed = new EmbedBuilder()
      .setColor(0xe11d48)
      .setDescription(item.description || "Sin descripción.")
      .addFields(
        {
          name: "Precio",
          value: `**${item.price.toLocaleString("es-MX")}** ${currency}`,
          inline: true,
        },
        { name: "Stock", value: stockLabel, inline: true },
        {
          name: "Beneficios",
          value: rewards.slice(0, 1024),
          inline: false,
        },
        {
          name: "Comprar",
          value: `\`/buy item:${item.id}\``,
          inline: false,
        },
      );

    const icon = (item.icon || "🛒").trim();
    if (isImageIcon(icon)) {
      embed.setTitle(item.name.slice(0, 256));
      try {
        const resolved = resolveEmbedMedia(
          icon,
          "icon",
          `shop-icon-${index}`,
        );
        if (resolved.url) embed.setThumbnail(resolved.url);
        if (resolved.file) files.push(resolved.file);
      } catch {
        /* ícono ilegible: título sin thumbnail */
      }
    } else {
      embed.setTitle(`${icon} ${item.name}`.slice(0, 256));
    }

    return embed;
  });

  const extra =
    items.length > 10 ? `\n_…y ${items.length - 10} ítems más._` : "";

  await interaction.editReply({
    content: `🛒 **Tienda de ${interaction.guild.name}**${extra}`,
    embeds,
    files,
  });
}
