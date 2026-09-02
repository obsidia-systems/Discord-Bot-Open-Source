import { and, eq } from "drizzle-orm";
import type {
  UpdateVoiceRoomGeneratorRequest,
  UpsertVoiceRoomGeneratorRequest,
  VoiceRoomActionMap,
  VoiceRoomGenerator,
  VoiceRoomLive,
  VoiceRoomsConfigResponse,
} from "@adobos/shared";
import {
  VOICE_ROOM_DEFAULT_TEMPLATE,
  VOICE_ROOM_GENERATORS_MAX,
  applyVoiceRoomNameTemplate,
  clampVoiceUserLimit,
  defaultVoiceRoomActions,
  normalizeVoiceRoomActions,
  sanitizeVoiceRoomName,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
import {
  guildSettings,
  voiceRoomGenerators,
  voiceRooms,
  type VoiceRoomGeneratorRow,
  type VoiceRoomRow,
} from "../../db/schema.js";

export class VoiceRoomsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "VoiceRoomsError";
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new VoiceRoomsError("Falta guildId.", 400, "MISSING_GUILD_ID");
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(
    getDb()
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existing) {
    await getDb().insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function mapGenerator(row: VoiceRoomGeneratorRow): VoiceRoomGenerator {
  return {
    id: row.id,
    guildId: row.guildId,
    hubChannelId: row.hubChannelId,
    categoryId: row.categoryId,
    nameTemplate: row.nameTemplate,
    defaultUserLimit: row.defaultUserLimit,
    defaultBitrate: row.defaultBitrate,
    autoText: row.autoText,
    enabled: row.enabled,
    allowedActions: normalizeVoiceRoomActions(parseJsonObject(row.allowedActions)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRoom(row: VoiceRoomRow): VoiceRoomLive {
  return {
    channelId: row.channelId,
    guildId: row.guildId,
    generatorId: row.generatorId,
    ownerId: row.ownerId,
    textChannelId: row.textChannelId,
    locked: row.locked,
    ghosted: row.ghosted,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listVoiceRoomsConfig(
  guildId?: string,
): Promise<VoiceRoomsConfigResponse> {
  const id = resolveGuildId(guildId);
  const db = getDb();
  const generators = await db
    .select()
    .from(voiceRoomGenerators)
    .where(eq(voiceRoomGenerators.guildId, id));
  const rooms = await db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.guildId, id));
  return {
    generators: generators.map(mapGenerator),
    rooms: rooms.map(mapRoom),
  };
}

export async function listEnabledGenerators(guildId: string) {
  const rows = await getDb()
    .select()
    .from(voiceRoomGenerators)
    .where(
      and(
        eq(voiceRoomGenerators.guildId, guildId),
        eq(voiceRoomGenerators.enabled, true),
      ),
    );
  return rows.map(mapGenerator);
}

export async function getGeneratorByHub(
  guildId: string,
  hubChannelId: string,
): Promise<VoiceRoomGenerator | null> {
  const row = await one(
    getDb()
      .select()
      .from(voiceRoomGenerators)
      .where(
        and(
          eq(voiceRoomGenerators.guildId, guildId),
          eq(voiceRoomGenerators.hubChannelId, hubChannelId),
          eq(voiceRoomGenerators.enabled, true),
        ),
      )
      .limit(1),
  );
  return row ? mapGenerator(row) : null;
}

export async function getGeneratorById(
  id: number,
  guildId: string,
): Promise<VoiceRoomGenerator> {
  const row = await one(
    getDb()
      .select()
      .from(voiceRoomGenerators)
      .where(
        and(
          eq(voiceRoomGenerators.id, id),
          eq(voiceRoomGenerators.guildId, guildId),
        ),
      )
      .limit(1),
  );
  if (!row) {
    throw new VoiceRoomsError("Generador no encontrado.", 404, "NOT_FOUND");
  }
  return mapGenerator(row);
}

export async function listHubChannelIds(guildId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ hubChannelId: voiceRoomGenerators.hubChannelId })
    .from(voiceRoomGenerators)
    .where(eq(voiceRoomGenerators.guildId, guildId));
  return rows.map((r) => r.hubChannelId);
}

export async function getRoomByChannel(
  channelId: string,
): Promise<VoiceRoomLive | null> {
  const row = await one(
    getDb()
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.channelId, channelId))
      .limit(1),
  );
  return row ? mapRoom(row) : null;
}

export async function getRoomByOwner(
  guildId: string,
  ownerId: string,
): Promise<VoiceRoomLive | null> {
  const row = await one(
    getDb()
      .select()
      .from(voiceRooms)
      .where(
        and(eq(voiceRooms.guildId, guildId), eq(voiceRooms.ownerId, ownerId)),
      )
      .limit(1),
  );
  return row ? mapRoom(row) : null;
}

export async function listGuildRooms(guildId: string): Promise<VoiceRoomLive[]> {
  const rows = await getDb()
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.guildId, guildId));
  return rows.map(mapRoom);
}

function mergeActions(
  current: VoiceRoomActionMap,
  patch?: Partial<VoiceRoomActionMap>,
): VoiceRoomActionMap {
  if (!patch) return current;
  return normalizeVoiceRoomActions({ ...current, ...patch });
}

export async function createGenerator(
  input: UpsertVoiceRoomGeneratorRequest,
  guildId?: string,
): Promise<VoiceRoomGenerator> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const existing = await getDb()
    .select({ id: voiceRoomGenerators.id })
    .from(voiceRoomGenerators)
    .where(eq(voiceRoomGenerators.guildId, id));
  if (existing.length >= VOICE_ROOM_GENERATORS_MAX) {
    throw new VoiceRoomsError(
      `Máximo ${VOICE_ROOM_GENERATORS_MAX} generadores por servidor.`,
      400,
      "LIMIT_EXCEEDED",
    );
  }
  const hubChannelId = input.hubChannelId.trim();
  if (!/^\d{17,20}$/.test(hubChannelId)) {
    throw new VoiceRoomsError("Canal hub inválido.", 400, "INVALID_HUB");
  }
  const categoryId = input.categoryId?.trim() || null;
  if (categoryId && !/^\d{17,20}$/.test(categoryId)) {
    throw new VoiceRoomsError("Categoría inválida.", 400, "INVALID_CATEGORY");
  }
  const nameTemplate = sanitizeVoiceRoomName(
    (input.nameTemplate ?? VOICE_ROOM_DEFAULT_TEMPLATE).trim() ||
      VOICE_ROOM_DEFAULT_TEMPLATE,
  );
  const allowed = mergeActions(defaultVoiceRoomActions(), input.allowedActions);
  try {
    const [row] = await getDb()
      .insert(voiceRoomGenerators)
      .values({
        guildId: id,
        hubChannelId,
        categoryId,
        nameTemplate,
        defaultUserLimit: clampVoiceUserLimit(input.defaultUserLimit ?? 0),
        defaultBitrate: Math.max(0, Math.trunc(input.defaultBitrate ?? 0)),
        autoText: input.autoText === true,
        enabled: input.enabled !== false,
        allowedActions: JSON.stringify(allowed),
        updatedAt: new Date(),
      })
      .returning();
    if (!row) {
      throw new VoiceRoomsError("No se pudo crear el generador.", 500, "INSERT_FAILED");
    }
    return mapGenerator(row);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new VoiceRoomsError(
        "Ese canal hub ya tiene un generador.",
        409,
        "HUB_TAKEN",
      );
    }
    throw error;
  }
}

export async function updateGenerator(
  generatorId: number,
  input: UpdateVoiceRoomGeneratorRequest,
  guildId?: string,
): Promise<VoiceRoomGenerator> {
  const id = resolveGuildId(guildId);
  const current = await getGeneratorById(generatorId, id);
  const hubChannelId = input.hubChannelId?.trim() ?? current.hubChannelId;
  if (!/^\d{17,20}$/.test(hubChannelId)) {
    throw new VoiceRoomsError("Canal hub inválido.", 400, "INVALID_HUB");
  }
  let categoryId = current.categoryId;
  if (input.categoryId !== undefined) {
    const raw = input.categoryId?.trim() || null;
    if (raw && !/^\d{17,20}$/.test(raw)) {
      throw new VoiceRoomsError("Categoría inválida.", 400, "INVALID_CATEGORY");
    }
    categoryId = raw;
  }
  const nameTemplate = input.nameTemplate
    ? sanitizeVoiceRoomName(input.nameTemplate)
    : current.nameTemplate;
  const allowed = mergeActions(current.allowedActions, input.allowedActions);
  const [row] = await getDb()
    .update(voiceRoomGenerators)
    .set({
      hubChannelId,
      categoryId,
      nameTemplate,
      defaultUserLimit:
        input.defaultUserLimit === undefined
          ? current.defaultUserLimit
          : clampVoiceUserLimit(input.defaultUserLimit),
      defaultBitrate:
        input.defaultBitrate === undefined
          ? current.defaultBitrate
          : Math.max(0, Math.trunc(input.defaultBitrate)),
      autoText: input.autoText ?? current.autoText,
      enabled: input.enabled ?? current.enabled,
      allowedActions: JSON.stringify(allowed),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(voiceRoomGenerators.id, generatorId),
        eq(voiceRoomGenerators.guildId, id),
      ),
    )
    .returning();
  if (!row) {
    throw new VoiceRoomsError("Generador no encontrado.", 404, "NOT_FOUND");
  }
  return mapGenerator(row);
}

export async function deleteGenerator(
  generatorId: number,
  guildId?: string,
): Promise<VoiceRoomLive[]> {
  const id = resolveGuildId(guildId);
  const rooms = await getDb()
    .select()
    .from(voiceRooms)
    .where(
      and(eq(voiceRooms.generatorId, generatorId), eq(voiceRooms.guildId, id)),
    );
  const deleted = await getDb()
    .delete(voiceRoomGenerators)
    .where(
      and(
        eq(voiceRoomGenerators.id, generatorId),
        eq(voiceRoomGenerators.guildId, id),
      ),
    )
    .returning({ id: voiceRoomGenerators.id });
  if (deleted.length === 0) {
    throw new VoiceRoomsError("Generador no encontrado.", 404, "NOT_FOUND");
  }
  return rooms.map(mapRoom);
}

export async function insertRoom(input: {
  channelId: string;
  guildId: string;
  generatorId: number;
  ownerId: string;
  textChannelId?: string | null;
}): Promise<VoiceRoomLive> {
  const [row] = await getDb()
    .insert(voiceRooms)
    .values({
      channelId: input.channelId,
      guildId: input.guildId,
      generatorId: input.generatorId,
      ownerId: input.ownerId,
      textChannelId: input.textChannelId ?? null,
    })
    .returning();
  if (!row) {
    throw new VoiceRoomsError("No se pudo registrar la sala.", 500, "INSERT_FAILED");
  }
  return mapRoom(row);
}

export async function patchRoom(
  channelId: string,
  patch: Partial<{
    ownerId: string;
    textChannelId: string | null;
    locked: boolean;
    ghosted: boolean;
  }>,
): Promise<VoiceRoomLive | null> {
  const [row] = await getDb()
    .update(voiceRooms)
    .set(patch)
    .where(eq(voiceRooms.channelId, channelId))
    .returning();
  return row ? mapRoom(row) : null;
}

export async function deleteRoomRow(channelId: string): Promise<void> {
  await getDb().delete(voiceRooms).where(eq(voiceRooms.channelId, channelId));
}

export function previewRoomName(
  template: string,
  displayName: string,
  username: string,
): string {
  return applyVoiceRoomNameTemplate(template, { displayName, username });
}
