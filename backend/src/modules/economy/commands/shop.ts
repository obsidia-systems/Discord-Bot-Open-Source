import type { EconomyShopItem } from "@adobos/shared";
import { summarizeShopRewards } from "@adobos/shared";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { consumeInteractionEphemeral } from "#modules/system-commands/ephemeral.js";
import { getEconomyConfig } from "../service.js";
import { listShopItems } from "../shopService.js";
import { EPHEMERAL, visibility } from "./visibility.js";

export const BUY_BUTTON_PREFIX = "buy_";
export const SHOP_PAGE_PREFIX = "shop_page_";

const ITEMS_PER_PAGE = 5;

function isImageIcon(icon: string): boolean {
  const s = icon.trim();
  return (
    s.startsWith("/uploads/") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

function formatItemBlock(item: EconomyShopItem, currency: string): string {
  const stockLabel = item.stock === null ? "∞" : String(item.stock);
  const icon = (item.icon || "").trim();
  const namePrefix = icon && !isImageIcon(icon) ? `${icon} ` : "🛒 ";
  const benefits = summarizeShopRewards(item.rewards);
  const benefitsLabel = benefits.length > 0 ? benefits.join(", ") : "None";

  let desc = (item.description || "No description.")
    .replace(/\s+/g, " ")
    .trim();
  if (desc.length > 150) {
    desc = `${desc.slice(0, 147)}...`;
  }

  return [
    `**${namePrefix}${item.name}** ━ ${item.price.toLocaleString("es-MX")} ${currency}`,
    `**Stock:** ${stockLabel} | **Benefits:** ${benefitsLabel}`,
    `*${desc}*`,
    "━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

function buyButtonLabel(name: string): string {
  const prefix = "🛒 Buy ";
  const maxName = 80 - prefix.length;
  const truncated =
    name.length > maxName
      ? `${name.slice(0, Math.max(1, maxName - 1))}…`
      : name;
  return `${prefix}${truncated}`;
}

async function loadCatalogItems(guildId: string): Promise<EconomyShopItem[]> {
  return (await listShopItems(guildId, { enabledOnly: true })).filter(
    (item) => item.stock === null || item.stock > 0,
  );
}

/**
 * Construye embed + componentes de una página del catálogo.
 * Compartido por `/shop` y los botones `shop_page_*`.
 */
export function buildShopCatalogPage(
  items: EconomyShopItem[],
  currency: string,
  page: number,
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(0, Math.trunc(page)), totalPages - 1);
  const pageItems = items.slice(
    safePage * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  );

  const description =
    pageItems.map((item) => formatItemBlock(item, currency)).join("\n\n") ||
    "_No items on this page._";

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle("🛒 Server Shop")
    .setDescription(description)
    .setFooter({
      text: `Page ${safePage + 1} of ${totalPages} · Buy button or /buy`,
    });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (pageItems.length > 0) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...pageItems.map((item) =>
          new ButtonBuilder()
            .setCustomId(`${BUY_BUTTON_PREFIX}${item.id}`)
            .setLabel(buyButtonLabel(item.name))
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    );
  }

  const prevPage = Math.max(0, safePage - 1);
  const nextPage = Math.min(totalPages - 1, safePage + 1);
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${SHOP_PAGE_PREFIX}${prevPage}_prev`)
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`${SHOP_PAGE_PREFIX}${nextPage}_next`)
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
    ),
  );

  return { embeds: [embed], components };
}

/**
 * /shop — catálogo paginado (5 ítems) + botones de compra y navegación.
 */
export async function handleShopCommand(
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

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply(visibility(ephemeral));

  const items = await loadCatalogItems(interaction.guildId);
  if (items.length === 0) {
    await interaction.editReply({
      content:
        "The shop is empty for now. An administrator can add items in the panel.",
    });
    return;
  }

  const currency = economy.currencyName || "coins";
  const payload = buildShopCatalogPage(items, currency, 0);
  await interaction.editReply(payload);
}

/**
 * Botón `shop_page_<n>` — actualiza el mensaje de `/shop` in-place.
 */
export async function handleShopPageButton(
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
    await interaction.update({
      content: "⛔ The economy is disabled in this server.",
      embeds: [],
      components: [],
    });
    return;
  }

  const rawPage = interaction.customId.split("_")[2];
  const page = Number(rawPage);
  if (!Number.isFinite(page) || page < 0) {
    await interaction.reply({
      content: "Invalid page.",
      ...EPHEMERAL,
    });
    return;
  }

  const items = await loadCatalogItems(interaction.guildId);
  if (items.length === 0) {
    await interaction.update({
      content:
        "The shop is empty for now. An administrator can add items in the panel.",
      embeds: [],
      components: [],
    });
    return;
  }

  const currency = economy.currencyName || "coins";
  const payload = buildShopCatalogPage(items, currency, page);
  await interaction.update(payload);
}
