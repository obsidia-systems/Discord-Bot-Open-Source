import { and, count, eq } from "drizzle-orm";
import type {
  StarboardConfigResponse,
  StarboardPost,
  StarboardSettings,
  UpdateStarboardSettingsRequest,
} from "@adobos/shared";
import {
  clampStarboardThreshold,
  defaultStarboardSettings,
  normalizeIgnoreChannelIds,
  normalizeStarboardEmojis,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
import {
  guildSettings,
  starboardPosts,
  starboardSettings,
  type StarboardPostRow,
  type StarboardSettingsRow,
} from "../../db/schema.js";

export class StarboardError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "StarboardError";
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new StarboardError("Falta guildId.", 400, "MISSING_GUILD_ID");
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

function parseJsonArray(raw: string | null | undefined): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
}

function mapSettings(
  guildId: string,
  row: StarboardSettingsRow | undefined,
): StarboardSettings {
  if (!row) return defaultStarboardSettings(guildId);
  return {
    guildId,
    channelId: row.channelId,
    emojis: normalizeStarboardEmojis(parseJsonArray(row.emojis)),
    threshold: clampStarboardThreshold(row.threshold),
    enabled: row.enabled,
    allowSelfStar: row.allowSelfStar,
    allowBots: row.allowBots,
    ignoreChannelIds: normalizeIgnoreChannelIds(
      parseJsonArray(row.ignoreChannelIds),
    ),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPost(row: StarboardPostRow): StarboardPost {
  return {
    originalMessageId: row.originalMessageId,
    guildId: row.guildId,
    channelId: row.channelId,
    starboardMessageId: row.starboardMessageId,
    starCount: row.starCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getStarboardSettings(
  guildId?: string,
): Promise<StarboardSettings> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(starboardSettings)
      .where(eq(starboardSettings.guildId, id))
      .limit(1),
  );
  return mapSettings(id, row);
}

export async function getStarboardConfig(
  guildId?: string,
): Promise<StarboardConfigResponse> {
  const id = resolveGuildId(guildId);
  const settings = await getStarboardSettings(id);
  const [row] = await getDb()
    .select({ n: count() })
    .from(starboardPosts)
    .where(eq(starboardPosts.guildId, id));
  return { settings, postCount: Number(row?.n ?? 0) };
}

export async function updateStarboardSettings(
  input: UpdateStarboardSettingsRequest,
  guildId?: string,
): Promise<StarboardSettings> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const current = await getStarboardSettings(id);

  const channelId =
    input.channelId === undefined ? current.channelId : input.channelId;
  const emojis =
    input.emojis === undefined
      ? current.emojis
      : normalizeStarboardEmojis(input.emojis);
  const threshold =
    input.threshold === undefined
      ? current.threshold
      : clampStarboardThreshold(input.threshold);
  const enabled =
    input.enabled === undefined ? current.enabled : input.enabled;
  const allowSelfStar =
    input.allowSelfStar === undefined
      ? current.allowSelfStar
      : input.allowSelfStar;
  const allowBots =
    input.allowBots === undefined ? current.allowBots : input.allowBots;
  const ignoreChannelIds =
    input.ignoreChannelIds === undefined
      ? current.ignoreChannelIds
      : normalizeIgnoreChannelIds(input.ignoreChannelIds);

  if (enabled && !channelId) {
    throw new StarboardError(
      "Elige un canal de texto o anuncios para el tablón.",
      400,
      "CHANNEL_REQUIRED",
    );
  }

  const now = new Date();
  await getDb()
    .insert(starboardSettings)
    .values({
      guildId: id,
      channelId,
      emojis: JSON.stringify(emojis),
      threshold,
      enabled,
      allowSelfStar,
      allowBots,
      ignoreChannelIds: JSON.stringify(ignoreChannelIds),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: starboardSettings.guildId,
      set: {
        channelId,
        emojis: JSON.stringify(emojis),
        threshold,
        enabled,
        allowSelfStar,
        allowBots,
        ignoreChannelIds: JSON.stringify(ignoreChannelIds),
        updatedAt: now,
      },
    });

  return getStarboardSettings(id);
}

export async function getPostByOriginal(
  originalMessageId: string,
): Promise<StarboardPost | null> {
  const row = await one(
    getDb()
      .select()
      .from(starboardPosts)
      .where(eq(starboardPosts.originalMessageId, originalMessageId))
      .limit(1),
  );
  return row ? mapPost(row) : null;
}

export async function getPostByStarboardMessage(
  starboardMessageId: string,
): Promise<StarboardPost | null> {
  const row = await one(
    getDb()
      .select()
      .from(starboardPosts)
      .where(eq(starboardPosts.starboardMessageId, starboardMessageId))
      .limit(1),
  );
  return row ? mapPost(row) : null;
}

export async function upsertStarboardPost(input: {
  originalMessageId: string;
  guildId: string;
  channelId: string;
  starboardMessageId: string;
  starCount: number;
}): Promise<StarboardPost> {
  const now = new Date();
  const [row] = await getDb()
    .insert(starboardPosts)
    .values({
      originalMessageId: input.originalMessageId,
      guildId: input.guildId,
      channelId: input.channelId,
      starboardMessageId: input.starboardMessageId,
      starCount: input.starCount,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: starboardPosts.originalMessageId,
      set: {
        starboardMessageId: input.starboardMessageId,
        starCount: input.starCount,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new StarboardError(
      "No se pudo guardar el post del tablón.",
      500,
      "UPSERT_FAILED",
    );
  }
  return mapPost(row);
}

export async function deleteStarboardPost(
  originalMessageId: string,
  guildId?: string,
): Promise<void> {
  if (guildId) {
    await getDb()
      .delete(starboardPosts)
      .where(
        and(
          eq(starboardPosts.originalMessageId, originalMessageId),
          eq(starboardPosts.guildId, guildId),
        ),
      );
    return;
  }
  await getDb()
    .delete(starboardPosts)
    .where(eq(starboardPosts.originalMessageId, originalMessageId));
}
