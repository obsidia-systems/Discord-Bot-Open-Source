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
  normalizePokemonRoleIds,
  POKEMON_COMMAND_NAMES,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
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
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new PokemonError(
      "Falta guildId.",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1));
  if (!existing) {
    await getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
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
    allowedRoles: normalizePokemonRoleIds(parseJsonArray(row.allowedRoles)),
    commands: normalizePokemonCommands(parseJsonObject(row.commands)),
  };
}

export async function getPokemonConfig(guildId?: string): Promise<PokemonConfig> {
  const id = resolveGuildId(guildId);
  const row = await one(getDb()
    .select()
    .from(pluginPokemonConfig)
    .where(eq(pluginPokemonConfig.guildId, id))
    .limit(1));
  return await rowToConfig(id, row);
}

export async function updatePokemonConfig(
  input: UpdatePokemonConfigRequest,
): Promise<PokemonConfig> {
  const id = resolveGuildId(input.guildId);
  await ensureGuildRow(id);
  const current = await getPokemonConfig(id);

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
    allowedRoles:
      input.allowedRoles !== undefined
        ? normalizePokemonRoleIds(input.allowedRoles)
        : current.allowedRoles,
    commands: normalizePokemonCommands({
      ...current.commands,
      ...(input.commands ?? {}),
    }),
  };

  const now = new Date();
  await getDb()
    .insert(pluginPokemonConfig)
    .values({
      guildId: id,
      isActive: next.isActive,
      defaultGeneration: next.defaultGeneration,
      language: next.language,
      embedColor: next.embedColor,
      forceEphemeral: next.forceEphemeral,
      allowedChannels: JSON.stringify(next.allowedChannels),
      allowedRoles: JSON.stringify(next.allowedRoles),
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
        allowedRoles: JSON.stringify(next.allowedRoles),
        commands: JSON.stringify(next.commands),
        updatedAt: now,
      },
    })
    ;

  return next;
}

export interface PokemonAccessContext {
  /** Role IDs del miembro que ejecuta el comando. */
  memberRoleIds?: string[];
  /** Administrators de Discord siempre pasan la lista de roles. */
  isAdministrator?: boolean;
}

/**
 * Valida plugin activo, comando habilitado, canal y roles permitidos.
 * `allowedRoles` vacío = cualquiera del servidor.
 */
export async function assertPokemonCommandAllowed(
  guildId: string,
  commandName: string,
  channelId: string | null,
  access: PokemonAccessContext = {},
): Promise<PokemonConfig> {
  const config = await getPokemonConfig(guildId);
  if (!config.isActive) {
    throw new PokemonError(
      "⛔ El plugin Pokémon está desactivado en este servidor.",
      400,
      "POKEMON_INACTIVE",
    );
  }

  if ((POKEMON_COMMAND_NAMES as readonly string[]).includes(commandName)) {
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

  if (config.allowedRoles.length > 0 && !access.isAdministrator) {
    const memberRoles = access.memberRoleIds ?? [];
    const ok = config.allowedRoles.some((id) => memberRoles.includes(id));
    if (!ok) {
      throw new PokemonError(
        "🚫 No tienes un rol permitido para usar comandos de Pokémon.",
        403,
        "POKEMON_ROLE_DENIED",
      );
    }
  }

  return config;
}
