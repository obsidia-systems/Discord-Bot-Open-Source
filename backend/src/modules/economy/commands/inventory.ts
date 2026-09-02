import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { EmbedBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { getDb } from "../../../db/client.js";
import {
  economyOwnedChannels,
  economyOwnedRoles,
  economyUserBoosts,
} from "../../../db/schema.js";
import { EconomyError } from "../service.js";
import { EPHEMERAL, visibility } from "./visibility.js";

function stillActive(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() > Date.now();
}

/**
 * /inventory
 */
export async function handleInventoryCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(visibility(ephemeral));

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const db = getDb();

  const [roles, channels, boosts] = await Promise.all([
    db
      .select()
      .from(economyOwnedRoles)
      .where(
        and(
          eq(economyOwnedRoles.guildId, guildId),
          eq(economyOwnedRoles.userId, userId),
        ),
      ),
    db
      .select()
      .from(economyOwnedChannels)
      .where(
        and(
          eq(economyOwnedChannels.guildId, guildId),
          eq(economyOwnedChannels.userId, userId),
        ),
      ),
    db
      .select()
      .from(economyUserBoosts)
      .where(
        and(
          eq(economyUserBoosts.guildId, guildId),
          eq(economyUserBoosts.userId, userId),
        ),
      ),
  ]);

  const roleLines = roles
    .filter((r) => stillActive(r.expiresAt))
    .map((r) => {
      const exp = r.expiresAt
        ? ` · caduca <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>`
        : " · permanente";
      return `• Rol <@&${r.roleId}>${exp}`;
    });
  const channelLines = channels
    .filter((c) => stillActive(c.expiresAt))
    .map((c) => {
      const exp = c.expiresAt
        ? ` · caduca <t:${Math.floor(c.expiresAt.getTime() / 1000)}:R>`
        : " · permanente";
      return `• Canal <#${c.channelId}>${exp}`;
    });
  const boostLines = boosts
    .filter((b) => stillActive(b.expiresAt))
    .map((b) => {
      const exp = b.expiresAt
        ? ` · caduca <t:${Math.floor(b.expiresAt.getTime() / 1000)}:R>`
        : " · permanente";
      return `• Boost ${b.module} ×${b.multiplier}${exp}`;
    });

  if (
    roleLines.length === 0 &&
    channelLines.length === 0 &&
    boostLines.length === 0
  ) {
    await interaction.editReply({
      content:
        "Tu inventario está vacío. Compra en `/shop`. Los roles se pueden equipar con `/use`.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle("Inventario")
    .setDescription(
      [
        roleLines.length ? `**Roles**\n${roleLines.join("\n")}` : "",
        channelLines.length ? `**Canales**\n${channelLines.join("\n")}` : "",
        boostLines.length ? `**Boosts**\n${boostLines.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    )
    .setFooter({ text: "Usa /use para equipar o quitar un rol comprado." });

  await interaction.editReply({ embeds: [embed] });
}

export async function handleUseAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused().toLowerCase();
  const rows = await getDb()
    .select()
    .from(economyOwnedRoles)
    .where(
      and(
        eq(economyOwnedRoles.guildId, interaction.guildId),
        eq(economyOwnedRoles.userId, interaction.user.id),
      ),
    );
  const guild = interaction.guild;
  const choices: Array<{ name: string; value: string }> = [];
  for (const row of rows) {
    if (!stillActive(row.expiresAt)) continue;
    const role = guild
      ? await guild.roles.fetch(row.roleId).catch(() => null)
      : null;
    const name = role?.name ?? `Rol ${row.roleId.slice(-4)}`;
    if (focused && !name.toLowerCase().includes(focused)) continue;
    choices.push({ name: name.slice(0, 100), value: row.id });
    if (choices.length >= 25) break;
  }
  await interaction.respond(choices);
}

/**
 * /use item — equipa o quita un rol comprado.
 */
export async function handleUseCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ...EPHEMERAL,
    });
    return;
  }

  const ownedId = interaction.options.getString("item", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const row = await getDb()
      .select()
      .from(economyOwnedRoles)
      .where(eq(economyOwnedRoles.id, ownedId))
      .then((rows) => rows[0]);
    if (
      !row ||
      row.guildId !== interaction.guildId ||
      row.userId !== interaction.user.id
    ) {
      throw new EconomyError(
        "Ese ítem no está en tu inventario.",
        400,
        "NOT_OWNED",
      );
    }
    if (!stillActive(row.expiresAt)) {
      throw new EconomyError("Ese rol ya caducó.", 400, "EXPIRED");
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const role = await interaction.guild.roles.fetch(row.roleId);
    if (!role) {
      throw new EconomyError("El rol ya no existe en el servidor.", 400, "ROLE_GONE");
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, "Inventario: unequip");
      await interaction.reply({
        content: `Quitaste **${role.name}**. Sigue en tu inventario; usa \`/use\` para volver a ponerlo.`,
        ...visibility(ephemeral),
      });
      return;
    }

    await member.roles.add(role, "Inventario: equip");
    await interaction.reply({
      content: `Equipaste **${role.name}**.`,
      ...visibility(ephemeral),
    });
  } catch (error) {
    const message =
      error instanceof EconomyError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo usar el ítem.";
    await interaction.reply({ content: `❌ ${message}`, ...EPHEMERAL });
  }
}
