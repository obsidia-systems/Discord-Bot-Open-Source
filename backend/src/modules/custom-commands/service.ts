import type {
  CreateCustomCommandRequest,
  CustomCommand,
  CustomCommandOptions,
  CustomCommandPermissions,
  CustomCommandResponseData,
  UpdateCustomCommandRequest,
} from "@adobos/shared";
import {
  isValidCustomCommandName,
  normalizeCustomCommandName,
  normalizeCustomCommandOptions,
  normalizeCustomCommandPermissions,
  normalizeCustomCommandResponseData,
} from "@adobos/shared";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { customCommands, guildSettings } from "../../db/schema.js";

export class CustomCommandsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CustomCommandsError";
  }
}

/** Nombres de slash built-in (no pueden usarse como custom). */
let reservedNames = new Set<string>([
  "rank",
  "nivel",
  "leaderboard",
  "ban",
  "kick",
  "timeout",
  "ping",
  "serverinfo",
]);

export function setReservedSlashCommandNames(names: string[]): void {
  reservedNames = new Set(
    names.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
}

export function getReservedSlashCommandNames(): string[] {
  return [...reservedNames];
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new CustomCommandsError(
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

function rowToCommand(
  row: typeof customCommands.$inferSelect,
): CustomCommand {
  return {
    id: row.id,
    guildId: row.guildId,
    name: row.name,
    description: (row.description ?? "").trim().slice(0, 100) || "Comando personalizado",
    responseData: normalizeCustomCommandResponseData(
      parseJson<Partial<CustomCommandResponseData>>(row.responseData, {}),
    ),
    options: normalizeCustomCommandOptions(
      parseJson<Partial<CustomCommandOptions>>(row.options, {}),
    ),
    permissions: normalizeCustomCommandPermissions(
      parseJson<Partial<CustomCommandPermissions>>(row.permissions, {}),
    ),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function assertValidName(name: string): void {
  if (!isValidCustomCommandName(name)) {
    throw new CustomCommandsError(
      "El nombre debe ser 1–32 caracteres: minúsculas, números, _ o -.",
      400,
      "INVALID_NAME",
    );
  }
  if (reservedNames.has(name)) {
    throw new CustomCommandsError(
      `El nombre \`/${name}\` está reservado por el bot.`,
      400,
      "RESERVED_NAME",
    );
  }
}

export function listCustomCommands(guildId?: string): CustomCommand[] {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const rows = getDb()
    .select()
    .from(customCommands)
    .where(eq(customCommands.guildId, id))
    .orderBy(desc(customCommands.updatedAt))
    .all();
  return rows.map(rowToCommand);
}

export function getCustomCommand(
  commandId: number,
  guildId?: string,
): CustomCommand {
  const id = resolveGuildId(guildId);
  const row = getDb()
    .select()
    .from(customCommands)
    .where(
      and(eq(customCommands.id, commandId), eq(customCommands.guildId, id)),
    )
    .get();
  if (!row) {
    throw new CustomCommandsError(
      "Comando no encontrado.",
      404,
      "NOT_FOUND",
    );
  }
  return rowToCommand(row);
}

export function getCustomCommandByName(
  guildId: string,
  name: string,
): CustomCommand | null {
  const row = getDb()
    .select()
    .from(customCommands)
    .where(
      and(
        eq(customCommands.guildId, guildId),
        eq(customCommands.name, name.toLowerCase()),
      ),
    )
    .get();
  return row ? rowToCommand(row) : null;
}

export function createCustomCommand(
  input: CreateCustomCommandRequest,
  guildId?: string,
): CustomCommand {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);

  const name = normalizeCustomCommandName(input.name);
  assertValidName(name);

  const existing = getCustomCommandByName(id, name);
  if (existing) {
    throw new CustomCommandsError(
      `Ya existe un comando \`/${name}\`.`,
      409,
      "NAME_TAKEN",
    );
  }

  const description =
    String(input.description ?? "")
      .trim()
      .slice(0, 100) || "Comando personalizado";
  const responseData = normalizeCustomCommandResponseData(input.responseData);
  if (!responseData.content.trim() && !responseData.embed) {
    throw new CustomCommandsError(
      "Añade texto de respuesta o un embed.",
      400,
      "EMPTY_RESPONSE",
    );
  }
  const options = normalizeCustomCommandOptions(input.options);
  const permissions = normalizeCustomCommandPermissions(input.permissions);
  const now = new Date();

  const result = getDb()
    .insert(customCommands)
    .values({
      guildId: id,
      name,
      description,
      responseData: JSON.stringify(responseData),
      options: JSON.stringify(options),
      permissions: JSON.stringify(permissions),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getCustomCommand(Number(result.lastInsertRowid), id);
}

export function updateCustomCommand(
  commandId: number,
  input: UpdateCustomCommandRequest,
  guildId?: string,
): CustomCommand {
  const id = resolveGuildId(guildId);
  const current = getCustomCommand(commandId, id);

  let nextName = current.name;
  if (input.name !== undefined) {
    nextName = normalizeCustomCommandName(input.name);
    assertValidName(nextName);
    if (nextName !== current.name) {
      const clash = getCustomCommandByName(id, nextName);
      if (clash && clash.id !== commandId) {
        throw new CustomCommandsError(
          `Ya existe un comando \`/${nextName}\`.`,
          409,
          "NAME_TAKEN",
        );
      }
    }
  }

  const nextDescription =
    input.description !== undefined
      ? String(input.description).trim().slice(0, 100) ||
        "Comando personalizado"
      : current.description;

  const nextResponse =
    input.responseData !== undefined
      ? normalizeCustomCommandResponseData(input.responseData)
      : current.responseData;
  if (!nextResponse.content.trim() && !nextResponse.embed) {
    throw new CustomCommandsError(
      "Añade texto de respuesta o un embed.",
      400,
      "EMPTY_RESPONSE",
    );
  }

  const nextOptions =
    input.options !== undefined
      ? normalizeCustomCommandOptions({
          ...current.options,
          ...input.options,
        })
      : current.options;

  const nextPermissions =
    input.permissions !== undefined
      ? normalizeCustomCommandPermissions({
          ...current.permissions,
          ...input.permissions,
        })
      : current.permissions;

  getDb()
    .update(customCommands)
    .set({
      name: nextName,
      description: nextDescription,
      responseData: JSON.stringify(nextResponse),
      options: JSON.stringify(nextOptions),
      permissions: JSON.stringify(nextPermissions),
      updatedAt: new Date(),
    })
    .where(
      and(eq(customCommands.id, commandId), eq(customCommands.guildId, id)),
    )
    .run();

  return getCustomCommand(commandId, id);
}

export function deleteCustomCommand(
  commandId: number,
  guildId?: string,
): void {
  const id = resolveGuildId(guildId);
  getCustomCommand(commandId, id);
  getDb()
    .delete(customCommands)
    .where(
      and(eq(customCommands.id, commandId), eq(customCommands.guildId, id)),
    )
    .run();
}
