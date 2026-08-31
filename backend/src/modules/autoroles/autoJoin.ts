import { eq } from "drizzle-orm";
import type {
  AutoJoinRolesConfig,
  GetAutoJoinRolesResponse,
  SaveAutoJoinRolesRequest,
  SaveAutoJoinRolesResponse,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
import { autoRoles, guildSettings } from "../../db/schema.js";
import { AutoRoleError } from "./api/controller.js";

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new AutoRoleError(
      `${field} inválido.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

function resolveGuildId(raw?: string): string {
  return assertSnowflake(
    raw?.trim() || "",
    "guildId",
  );
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select()
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

function parseRoleIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter((id) => /^\d{17,20}$/.test(id));
  } catch {
    return [];
  }
}

function toConfig(row: {
  guildId: string;
  humanRoles: string;
  botRoles: string;
  updatedAt: Date | number;
}): AutoJoinRolesConfig {
  return {
    guildId: row.guildId,
    humanRoles: parseRoleIds(row.humanRoles),
    botRoles: parseRoleIds(row.botRoles),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString(),
  };
}

export async function getAutoJoinRoles(
  guildIdRaw?: string,
): Promise<GetAutoJoinRolesResponse> {
  const guildId = resolveGuildId(guildIdRaw);
  const row = await one(getDb()
    .select()
    .from(autoRoles)
    .where(eq(autoRoles.guildId, guildId))
    .limit(1));

  if (!row) {
    return {
      config: { guildId, humanRoles: [], botRoles: [] },
    };
  }

  return { config: toConfig(row) };
}

export async function saveAutoJoinRoles(
  input: SaveAutoJoinRolesRequest,
): Promise<SaveAutoJoinRolesResponse> {
  const guildId = resolveGuildId(input.guildId);
  const humanRoles = (input.humanRoles ?? [])
    .map((id) => assertSnowflake(id, "humanRoles"))
    .slice(0, 25);
  const botRoles = (input.botRoles ?? [])
    .map((id) => assertSnowflake(id, "botRoles"))
    .slice(0, 25);

  await ensureGuildRow(guildId);
  const now = new Date();
  const existing = await one(getDb()
    .select()
    .from(autoRoles)
    .where(eq(autoRoles.guildId, guildId))
    .limit(1));

  if (existing) {
    await getDb()
      .update(autoRoles)
      .set({
        humanRoles: JSON.stringify(humanRoles),
        botRoles: JSON.stringify(botRoles),
        updatedAt: now,
      })
      .where(eq(autoRoles.guildId, guildId))
      ;
  } else {
    await getDb()
      .insert(autoRoles)
      .values({
        guildId,
        humanRoles: JSON.stringify(humanRoles),
        botRoles: JSON.stringify(botRoles),
        updatedAt: now,
      })
      ;
  }

  return { ok: true, config: (await getAutoJoinRoles(guildId)).config };
}
