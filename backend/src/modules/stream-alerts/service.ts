import { and, count, eq } from "drizzle-orm";
import type {
  CreateStreamAlertRequest,
  StreamAlert,
  StreamAlertCredentials,
  StreamAlertsConfigResponse,
  StreamLiveSnapshot,
  UpdateStreamAlertRequest,
} from "@adobos/shared";
import {
  clampStreamAlertTemplate,
  isStreamAlertPlatform,
  normalizeStreamHandle,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
import {
  guildSettings,
  streamAlerts,
  type StreamAlertRow,
} from "../../db/schema.js";
import { assertWithinLimit } from "../../core/entitlements/service.js";

const SNOWFLAKE_RE = /^\d{17,20}$/;

export class StreamAlertsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "StreamAlertsError";
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new StreamAlertsError("Falta guildId.", 400, "MISSING_GUILD_ID");
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

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export function streamAlertCredentials(): StreamAlertCredentials {
  return {
    twitch: Boolean(
      process.env.TWITCH_CLIENT_ID?.trim() &&
        process.env.TWITCH_CLIENT_SECRET?.trim(),
    ),
    youtube: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    kick: true,
  };
}

function mapAlert(row: StreamAlertRow): StreamAlert {
  const platform = isStreamAlertPlatform(row.platform) ? row.platform : "twitch";
  return {
    id: row.id,
    guildId: row.guildId,
    platform,
    handle: row.handle,
    displayName: row.displayName,
    discordChannelId: row.discordChannelId,
    mentionRoleId: row.mentionRoleId,
    template: row.template,
    enabled: row.enabled,
    isLive: row.isLive,
    liveId: row.liveId,
    lastTitle: row.lastTitle,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastLiveAt: row.lastLiveAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireSnowflake(raw: string, label: string): string {
  const id = raw.trim();
  if (!SNOWFLAKE_RE.test(id)) {
    throw new StreamAlertsError(`${label} inválido.`, 400, "INVALID_SNOWFLAKE");
  }
  return id;
}

function optionalSnowflake(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  return requireSnowflake(raw, "Rol");
}

function parseHandle(
  platform: StreamAlert["platform"],
  raw: string,
): { handle: string; displayName: string } {
  const parsed = normalizeStreamHandle(platform, raw);
  if (!parsed) {
    throw new StreamAlertsError(
      "No reconocí ese canal. Pega la URL, el login o el @handle.",
      400,
      "INVALID_HANDLE",
    );
  }
  return parsed;
}

export async function listStreamAlertsConfig(
  guildId?: string,
): Promise<StreamAlertsConfigResponse> {
  const id = resolveGuildId(guildId);
  const rows = await getDb()
    .select()
    .from(streamAlerts)
    .where(eq(streamAlerts.guildId, id));
  return {
    alerts: rows.map(mapAlert),
    credentials: streamAlertCredentials(),
  };
}

export async function listEnabledStreamAlerts(): Promise<StreamAlert[]> {
  const rows = await getDb()
    .select()
    .from(streamAlerts)
    .where(eq(streamAlerts.enabled, true));
  return rows.map(mapAlert);
}

export async function getStreamAlert(
  alertId: number,
  guildId?: string,
): Promise<StreamAlert> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(streamAlerts)
      .where(and(eq(streamAlerts.id, alertId), eq(streamAlerts.guildId, id)))
      .limit(1),
  );
  if (!row) {
    throw new StreamAlertsError("Alerta no encontrada.", 404, "NOT_FOUND");
  }
  return mapAlert(row);
}

export async function createStreamAlert(
  input: CreateStreamAlertRequest,
  guildId?: string,
): Promise<StreamAlert> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);

  if (!isStreamAlertPlatform(input.platform)) {
    throw new StreamAlertsError("Plataforma no soportada.", 400, "INVALID_PLATFORM");
  }

  const [usage] = await getDb()
    .select({ n: count() })
    .from(streamAlerts)
    .where(eq(streamAlerts.guildId, id));
  await assertWithinLimit(id, "streamAlerts", usage?.n ?? 0);

  const parsed = parseHandle(input.platform, input.handle);
  const discordChannelId = requireSnowflake(input.discordChannelId, "Canal");
  const mentionRoleId = optionalSnowflake(input.mentionRoleId);
  const template = clampStreamAlertTemplate(input.template);
  const now = new Date();

  try {
    const [inserted] = await getDb()
      .insert(streamAlerts)
      .values({
        guildId: id,
        platform: input.platform,
        handle: parsed.handle,
        displayName: parsed.displayName,
        discordChannelId,
        mentionRoleId,
        template,
        enabled: input.enabled !== false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!inserted) {
      throw new StreamAlertsError(
        "No se pudo crear la alerta.",
        500,
        "INSERT_FAILED",
      );
    }
    return mapAlert(inserted);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new StreamAlertsError(
        "Ya hay una alerta para ese canal.",
        409,
        "DUPLICATE_HANDLE",
      );
    }
    throw error;
  }
}

export async function updateStreamAlert(
  alertId: number,
  input: UpdateStreamAlertRequest,
  guildId?: string,
): Promise<StreamAlert> {
  const id = resolveGuildId(guildId);
  const current = await getStreamAlert(alertId, id);

  const platform = input.platform ?? current.platform;
  if (!isStreamAlertPlatform(platform)) {
    throw new StreamAlertsError("Plataforma no soportada.", 400, "INVALID_PLATFORM");
  }

  const parsed =
    input.handle !== undefined || input.platform !== undefined
      ? parseHandle(platform, input.handle ?? current.handle)
      : { handle: current.handle, displayName: current.displayName };

  const discordChannelId =
    input.discordChannelId !== undefined
      ? requireSnowflake(input.discordChannelId, "Canal")
      : current.discordChannelId;
  const mentionRoleId =
    input.mentionRoleId !== undefined
      ? optionalSnowflake(input.mentionRoleId)
      : current.mentionRoleId;
  const template =
    input.template !== undefined
      ? clampStreamAlertTemplate(input.template)
      : current.template;
  const enabled = input.enabled ?? current.enabled;
  const now = new Date();

  const identityChanged =
    platform !== current.platform || parsed.handle !== current.handle;

  try {
    const [updated] = await getDb()
      .update(streamAlerts)
      .set({
        platform,
        handle: parsed.handle,
        displayName: parsed.displayName,
        discordChannelId,
        mentionRoleId,
        template,
        enabled,
        ...(identityChanged
          ? { isLive: false, liveId: null, lastTitle: null }
          : {}),
        updatedAt: now,
      })
      .where(and(eq(streamAlerts.id, alertId), eq(streamAlerts.guildId, id)))
      .returning();
    if (!updated) {
      throw new StreamAlertsError("Alerta no encontrada.", 404, "NOT_FOUND");
    }
    return mapAlert(updated);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new StreamAlertsError(
        "Ya hay una alerta para ese canal.",
        409,
        "DUPLICATE_HANDLE",
      );
    }
    throw error;
  }
}

export async function deleteStreamAlert(
  alertId: number,
  guildId?: string,
): Promise<void> {
  const id = resolveGuildId(guildId);
  const deleted = await getDb()
    .delete(streamAlerts)
    .where(and(eq(streamAlerts.id, alertId), eq(streamAlerts.guildId, id)))
    .returning({ id: streamAlerts.id });
  if (deleted.length === 0) {
    throw new StreamAlertsError("Alerta no encontrada.", 404, "NOT_FOUND");
  }
}

export async function applyStreamLiveState(
  alertId: number,
  snapshot: StreamLiveSnapshot,
  options: { announced: boolean },
): Promise<void> {
  const now = new Date();
  await getDb()
    .update(streamAlerts)
    .set({
      isLive: snapshot.isLive,
      liveId: snapshot.isLive ? snapshot.liveId : undefined,
      lastTitle: snapshot.title ?? undefined,
      displayName: snapshot.displayName || undefined,
      lastCheckedAt: now,
      lastLiveAt: options.announced ? now : undefined,
      updatedAt: now,
    })
    .where(eq(streamAlerts.id, alertId));
}

/** Marca last_checked_at aunque el proveedor falle, para no martillar la API. */
export async function touchStreamAlertChecked(alertId: number): Promise<void> {
  const now = new Date();
  await getDb()
    .update(streamAlerts)
    .set({ lastCheckedAt: now, updatedAt: now })
    .where(eq(streamAlerts.id, alertId));
}
