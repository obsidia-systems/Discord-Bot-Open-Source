import type {
  PokemonConfig,
  PokemonCommandName,
  UpdatePokemonConfigRequest,
} from "@adobos/shared";
import {
  defaultPokemonConfig,
  normalizePokemonChannelIds,
  normalizePokemonCommands,
  normalizePokemonEmbedColor,
  normalizePokemonGeneration,
  normalizePokemonLanguage,
  POKEMON_COMMAND_NAMES,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { guildSettings, pluginPokemonConfig } from "../../db/schema.js";

export class PokemonError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PokemonError";
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new PokemonError(
      "Falta DISCORD_GUILD_ID (o guildId).",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

function ensureGuildRow(guildId: string): void {
  const existing = getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();
  if (!existing) {
    getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToConfig(
  guildId: string,
  row: typeof pluginPokemonConfig.$inferSelect | undefined,
): PokemonConfig {
  if (!row) return defaultPokemonConfig(guildId);
  return {
    guildId: row.guildId,
    isActive: row.isActive,
    defaultGeneration: normalizePokemonGeneration(row.defaultGeneration),
    language: normalizePokemonLanguage(row.language),
    embedColor: normalizePokemonEmbedColor(row.embedColor),
    forceEphemeral: row.forceEphemeral,
    allowedChannels: normalizePokemonChannelIds(
      parseJsonArray(row.allowedChannels),
    ),
    commands: normalizePokemonCommands(parseJsonObject(row.commands)),
  };
}

export function getPokemonConfig(guildId?: string): PokemonConfig {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(pluginPokemonConfig)
    .where(eq(pluginPokemonConfig.guildId, id))
    .get();
  return rowToConfig(id, row);
}

export function updatePokemonConfig(
  input: UpdatePokemonConfigRequest,
): PokemonConfig {
  const id = resolveGuildId(input.guildId);
  ensureGuildRow(id);
  const current = getPokemonConfig(id);

  const next: PokemonConfig = {
    guildId: id,
    isActive:
      typeof input.isActive === "boolean" ? input.isActive : current.isActive,
    defaultGeneration: normalizePokemonGeneration(
      input.defaultGeneration ?? current.defaultGeneration,
      current.defaultGeneration,
    ),
    language: normalizePokemonLanguage(
      input.language ?? current.language,
      current.language,
    ),
    embedColor: normalizePokemonEmbedColor(
      input.embedColor ?? current.embedColor,
      current.embedColor,
    ),
    forceEphemeral:
      typeof input.forceEphemeral === "boolean"
        ? input.forceEphemeral
        : current.forceEphemeral,
    allowedChannels:
      input.allowedChannels !== undefined
        ? normalizePokemonChannelIds(input.allowedChannels)
        : current.allowedChannels,
    commands: normalizePokemonCommands({
      ...current.commands,
      ...(input.commands ?? {}),
    }),
  };

  const now = new Date();
  getDb()
    .insert(pluginPokemonConfig)
    .values({
      guildId: id,
      isActive: next.isActive,
      defaultGeneration: next.defaultGeneration,
      language: next.language,
      embedColor: next.embedColor,
      forceEphemeral: next.forceEphemeral,
      allowedChannels: JSON.stringify(next.allowedChannels),
      commands: JSON.stringify(next.commands),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pluginPokemonConfig.guildId,
      set: {
        isActive: next.isActive,
        defaultGeneration: next.defaultGeneration,
        language: next.language,
        embedColor: next.embedColor,
        forceEphemeral: next.forceEphemeral,
        allowedChannels: JSON.stringify(next.allowedChannels),
        commands: JSON.stringify(next.commands),
        updatedAt: now,
      },
    })
    .run();

  return next;
}

/** Valida plugin activo, comando habilitado y canal permitido. */
export function assertPokemonCommandAllowed(
  guildId: string,
  commandName: string,
  channelId: string | null,
): PokemonConfig {
  const config = getPokemonConfig(guildId);
  if (!config.isActive) {
    throw new PokemonError(
      "⛔ El plugin Pokémon está desactivado en este servidor.",
      400,
      "POKEMON_INACTIVE",
    );
  }

  if (
    (POKEMON_COMMAND_NAMES as readonly string[]).includes(commandName)
  ) {
    const key = commandName as PokemonCommandName;
    if (!config.commands[key]) {
      throw new PokemonError(
        `⛔ \`/${commandName}\` está desactivado en la configuración del plugin.`,
        400,
        "POKEMON_COMMAND_DISABLED",
      );
    }
  }

  if (
    config.allowedChannels.length > 0 &&
    channelId &&
    !config.allowedChannels.includes(channelId)
  ) {
    throw new PokemonError(
      "⛔ Este comando de Pokémon no está permitido en este canal.",
      400,
      "POKEMON_CHANNEL_DENIED",
    );
  }

  return config;
}
