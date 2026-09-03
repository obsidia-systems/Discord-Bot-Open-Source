import type { EconomyCasinoConfig } from "@adobos/shared";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from "discord.js";
import { assertCasinoBetAllowed } from "../domain/casinoService.js";
import { EconomyError, getEconomyConfig } from "../domain/economy.js";
import { EPHEMERAL } from "./visibility.js";

export const WIN = 0x57f287;
export const LOSE = 0xed4245;
export const PUSH = 0xfaa61a;
export const INFO = 0x5865f2;

/** Mesa inactiva tras resolver: botones de «otra vez». */
export const TABLE_IDLE_MS = 5 * 60_000;

export function tableKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function parseOwnerCustomId(customId: string): {
  action: string;
  ownerId: string | undefined;
} {
  const idx = customId.indexOf(":");
  if (idx < 0) return { action: customId, ownerId: undefined };
  return {
    action: customId.slice(0, idx),
    ownerId: customId.slice(idx + 1),
  };
}

export function playAgainRow(
  customId: string,
  label = "Again",
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setEmoji("🔁")
      .setStyle(ButtonStyle.Primary),
  );
}

export function currencyOf(
  economy: Awaited<ReturnType<typeof getEconomyConfig>>,
): string {
  return economy.currencyName || "coins";
}

export async function assertEconomyAndCasino(
  guildId: string,
  bet: number,
): Promise<{
  economy: Awaited<ReturnType<typeof getEconomyConfig>>;
  casino: EconomyCasinoConfig;
}> {
  const economy = await getEconomyConfig(guildId);
  if (!economy.isActive) {
    throw new EconomyError(
      "⛔ The economy is disabled in this server.",
      400,
      "ECONOMY_INACTIVE",
    );
  }
  const casino = await assertCasinoBetAllowed(guildId, bet);
  return { economy, casino };
}

export async function replyCasinoError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof EconomyError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Couldn't complete the play.";
  const content = `❌ ${message}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, ...EPHEMERAL });
  } else {
    await interaction.reply({ content, ...EPHEMERAL });
  }
}

export async function clearMessageComponents(input: {
  client: Client;
  channelId: string;
  messageId: string;
}): Promise<void> {
  try {
    const channel = await input.client.channels.fetch(input.channelId);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) return;
    const msg = await channel.messages.fetch(input.messageId);
    await msg.edit({ components: [] });
  } catch {
    /* mensaje ya no existe */
  }
}
