import type {
  SystemCommandConfig,
  SystemCommandPermission,
  UpdateSystemCommandsRequest,
} from "@adobos/shared";
import {
  SYSTEM_COMMAND_CATALOG,
  defaultSystemCommandPermission,
  getSystemCommandDefinition,
} from "@adobos/shared";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  defaultCommandPermissions,
  guildSettings,
} from "../../db/schema.js";

export class SystemCommandsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "SystemCommandsError";
  }
}

function parseIdArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
  } catch {
    return [];
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new SystemCommandsError(
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

function rowToPermission(
  guildId: string,
  commandName: string,
  row:
    | {
        enabled: boolean;
        allowedRoles: string;
        ignoredChannels?: string | null;
        ephemeral: boolean;
      }
    | undefined,
): SystemCommandPermission {
  const def = getSystemCommandDefinition(commandName);
  if (!def) {
    return {
      guildId,
      commandName,
      enabled: row?.enabled ?? true,
      allowedRoles: parseIdArray(row?.allowedRoles),
      ignoredChannels: parseIdArray(row?.ignoredChannels),
      ephemeral: row?.ephemeral ?? false,
    };
  }
  if (!row) return defaultSystemCommandPermission(guildId, def);
  return {
    guildId,
    commandName,
    enabled: row.enabled,
    allowedRoles: parseIdArray(row.allowedRoles),
    ignoredChannels: parseIdArray(row.ignoredChannels),
    ephemeral: row.ephemeral,
  };
}

/** Permiso efectivo de un comando (defaults del catálogo si no hay fila). */
export function getCommandPermission(
  guildId: string,
  commandName: string,
): SystemCommandPermission {
  const row = getDb()
    .select()
    .from(defaultCommandPermissions)
    .where(
      and(
        eq(defaultCommandPermissions.guildId, guildId),
        eq(defaultCommandPermissions.commandName, commandName),
      ),
    )
    .get();

  return rowToPermission(guildId, commandName, row);
}

/** Lista catálogo + permisos guardados para el dashboard. */
export function listSystemCommandConfigs(
  guildId?: string,
): SystemCommandConfig[] {
  const id = resolveGuildId(guildId);
  const rows = getDb()
    .select()
    .from(defaultCommandPermissions)
    .where(eq(defaultCommandPermissions.guildId, id))
    .all();

  const byName = new Map(rows.map((r) => [r.commandName, r]));

  return SYSTEM_COMMAND_CATALOG.map((def) => {
    const perm = rowToPermission(id, def.name, byName.get(def.name));
    return {
      ...def,
      parameters: def.options,
      enabled: perm.enabled,
      allowedRoles: perm.allowedRoles,
      ignoredChannels: perm.ignoredChannels,
      ephemeral: perm.ephemeral,
    };
  });
}

/** Upsert masivo de permisos (solo nombres del catálogo). */
export function updateSystemCommandPermissions(
  input: UpdateSystemCommandsRequest,
  guildId?: string,
): SystemCommandConfig[] {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);

  if (!Array.isArray(input.commands)) {
    throw new SystemCommandsError(
      "Payload inválido: falta commands[].",
      400,
      "INVALID_BODY",
    );
  }

  const known = new Set(SYSTEM_COMMAND_CATALOG.map((c) => c.name));
  const now = new Date();

  for (const item of input.commands) {
    const name = (item.commandName ?? "").trim().toLowerCase();
    if (!known.has(name)) {
      throw new SystemCommandsError(
        `Comando desconocido: ${item.commandName}`,
        400,
        "UNKNOWN_COMMAND",
      );
    }

    const allowedRoles = Array.isArray(item.allowedRoles)
      ? item.allowedRoles
          .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
          .map((r) => r.trim())
      : [];

    const ignoredChannels = Array.isArray(item.ignoredChannels)
      ? item.ignoredChannels
          .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
          .map((r) => r.trim())
      : [];

    const enabled = Boolean(item.enabled);
    const ephemeral = Boolean(item.ephemeral);
    const def = getSystemCommandDefinition(name)!;

    getDb()
      .insert(defaultCommandPermissions)
      .values({
        guildId: id,
        commandName: name,
        enabled,
        allowedRoles: JSON.stringify(allowedRoles),
        ignoredChannels: JSON.stringify(ignoredChannels),
        ephemeral: def.supportsEphemeral ? ephemeral : def.defaultEphemeral,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          defaultCommandPermissions.guildId,
          defaultCommandPermissions.commandName,
        ],
        set: {
          enabled,
          allowedRoles: JSON.stringify(allowedRoles),
          ignoredChannels: JSON.stringify(ignoredChannels),
          ephemeral: def.supportsEphemeral ? ephemeral : def.defaultEphemeral,
          updatedAt: now,
        },
      })
      .run();
  }

  return listSystemCommandConfigs(id);
}
