import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
} from "discord.js";
import { EmbedBuilder } from "discord.js";
import { resolveEmbedMedia } from "../../../lib/embedMedia.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { EconomyError, getEconomyConfig } from "../service.js";
import { purchaseShopItem } from "../purchaseService.js";
import { listShopItems } from "../shopService.js";
import { BUY_BUTTON_PREFIX } from "./shop.js";

type PurchaseInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction;

async function replyPurchaseResult(
  interaction: PurchaseInteraction,
  guild: Guild,
  member: GuildMember,
  itemId: string,
): Promise<void> {
  const economy = getEconomyConfig(guild.id);
  const result = await purchaseShopItem(guild, member, itemId);
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
}

/**
 * Autocomplete de `/buy item` — sugiere por nombre, value = id.
 */
export async function handleBuyAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "item") {
    await interaction.respond([]);
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  const query = focused.value.trim().toLowerCase();
  const matches = listShopItems(guildId, { enabledOnly: true })
    .filter((item) => item.stock === null || item.stock > 0)
    .filter(
      (item) => !query || item.name.toLowerCase().includes(query),
    )
    .slice(0, 25)
    .map((item) => ({
      name: `${item.name} — ${item.price.toLocaleString("es-MX")}`.slice(
        0,
        100,
      ),
      value: item.id,
    }));

  await interaction.respond(matches);
}

/**
 * /buy item:<id vía autocomplete> — compra un ítem de la tienda.
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
      content: "⛔ La economía está desactivada en este servidor.",
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
    await replyPurchaseResult(
      interaction,
      interaction.guild,
      member,
      itemId,
    );
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

/**
 * Botón `buy_<itemId>` desde el mensaje de `/shop`.
 */
export async function handleBuyButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este control solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const economy = getEconomyConfig(interaction.guildId);
  if (!economy.isActive) {
    await interaction.reply({
      content: "⛔ La economía está desactivada en este servidor.",
      ephemeral: true,
    });
    return;
  }

  const itemId = interaction.customId.slice(BUY_BUTTON_PREFIX.length).trim();
  if (!itemId) {
    await interaction.reply({
      content: "Ítem inválido.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

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
    await replyPurchaseResult(
      interaction,
      interaction.guild,
      member,
      itemId,
    );
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
