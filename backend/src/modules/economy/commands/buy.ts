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
import { purchaseShopItem } from "../purchaseService.js";
import { EconomyError, getEconomyConfig } from "../service.js";
import { listShopItems } from "../shopService.js";
import { BUY_BUTTON_PREFIX } from "./shop.js";
import { EPHEMERAL, visibility } from "./visibility.js";

type PurchaseInteraction = ChatInputCommandInteraction | ButtonInteraction;

async function replyPurchaseResult(
  interaction: PurchaseInteraction,
  guild: Guild,
  member: GuildMember,
  itemId: string,
): Promise<void> {
  const economy = await getEconomyConfig(guild.id);
  const result = await purchaseShopItem(guild, member, itemId);
  const currency = economy.currencyName || "coins";
  const statusNote =
    result.status === "pending"
      ? "\n\nStaff have been notified to fulfill your order."
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
    .setTitle("Purchase complete")
    .setDescription(
      `You bought ${itemLabel} for **${result.item.price.toLocaleString("es-MX")}** ${currency}.${statusNote}`,
    )
    .addFields(
      {
        name: "Wallet",
        value: `\`${result.wallet.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Bank",
        value: `\`${result.bank.toLocaleString("es-MX")}\``,
        inline: true,
      },
    )
    .setFooter({ text: `Purchase ID: ${result.purchaseId}` })
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
  const matches = (await listShopItems(guildId, { enabledOnly: true }))
    .filter((item) => item.stock === null || item.stock > 0)
    .filter((item) => !query || item.name.toLowerCase().includes(query))
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
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const economy = await getEconomyConfig(interaction.guildId);
  if (!economy.isActive) {
    await interaction.reply({
      content: "⛔ The economy is disabled in this server.",
      ...EPHEMERAL,
    });
    return;
  }

  const itemId = interaction.options.getString("item", true).trim();
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(visibility(ephemeral));

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    await interaction.editReply({
      content: "Couldn't resolve your membership in the server.",
    });
    return;
  }

  try {
    await replyPurchaseResult(interaction, interaction.guild, member, itemId);
  } catch (error) {
    const message =
      error instanceof EconomyError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Couldn't complete the purchase.";
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
      content: "This control only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const economy = await getEconomyConfig(interaction.guildId);
  if (!economy.isActive) {
    await interaction.reply({
      content: "⛔ The economy is disabled in this server.",
      ...EPHEMERAL,
    });
    return;
  }

  const itemId = interaction.customId.slice(BUY_BUTTON_PREFIX.length).trim();
  if (!itemId) {
    await interaction.reply({
      content: "Invalid item.",
      ...EPHEMERAL,
    });
    return;
  }

  await interaction.deferReply(EPHEMERAL);

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    await interaction.editReply({
      content: "Couldn't resolve your membership in the server.",
    });
    return;
  }

  try {
    await replyPurchaseResult(interaction, interaction.guild, member, itemId);
  } catch (error) {
    const message =
      error instanceof EconomyError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Couldn't complete the purchase.";
    await interaction.editReply({ content: `❌ ${message}` });
  }
}
