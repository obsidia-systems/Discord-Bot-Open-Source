import {
  ActivityType,
  DiscordAPIError,
  PresenceUpdateStatus,
  type ActivitiesOptions,
  type Client,
  type PresenceStatusData,
} from "discord.js";
import { eq } from "drizzle-orm";
import type {
  BotActivityTypeName,
  BotPresenceStatus,
  BotProfileActivity,
  BotProfileResponse,
  UpdateBotProfileRequest,
  UpdateBotProfileResponse,
} from "@adobos/shared";
import {
  BOT_ACTIVITY_TYPES,
  BOT_PRESENCE_STATUSES,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { botPresenceSettings } from "../../db/schema.js";

export class BotProfileError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "BotProfileError";
  }
}

const PRESENCE_ROW_ID = "default";

const STATUS_TO_DJS: Record<BotPresenceStatus, PresenceStatusData> = {
  online: PresenceUpdateStatus.Online,
  idle: PresenceUpdateStatus.Idle,
  dnd: PresenceUpdateStatus.DoNotDisturb,
  invisible: PresenceUpdateStatus.Invisible,
};

const ACTIVITY_TO_DJS: Record<BotActivityTypeName, ActivityType> = {
  Playing: ActivityType.Playing,
  Streaming: ActivityType.Streaming,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
  Custom: ActivityType.Custom,
};

const STREAM_URL_RE =
  /^https?:\/\/(www\.)?(twitch\.tv\/|youtube\.com\/|youtu\.be\/)/i;

export interface PersistedPresence {
  status: BotPresenceStatus;
  activityType: BotActivityTypeName;
  activityName: string;
  streamUrl: string | null;
  state: string;
}

function assertBotReady(bot: Client): void {
  if (!bot.isReady() || !bot.user) {
    throw new BotProfileError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }
}

function parseStatus(raw: string): BotPresenceStatus {
  if (!BOT_PRESENCE_STATUSES.includes(raw as BotPresenceStatus)) {
    return "online";
  }
  return raw as BotPresenceStatus;
}

function parseActivityType(raw: string): BotActivityTypeName {
  if (!BOT_ACTIVITY_TYPES.includes(raw as BotActivityTypeName)) {
    return "Playing";
  }
  return raw as BotActivityTypeName;
}

function trimOrEmpty(value: string | undefined | null, max = 128): string {
  return (value ?? "").trim().slice(0, max);
}

function validateStreamUrl(url: string): string {
  const trimmed = url.trim();
  if (!STREAM_URL_RE.test(trimmed)) {
    throw new BotProfileError(
      "streamUrl debe ser un enlace válido de Twitch o YouTube.",
      400,
      "INVALID_STREAM_URL",
    );
  }
  return trimmed;
}

export function readPersistedPresence(): PersistedPresence | null {
  const db = getDb();
  const row = db
    .select()
    .from(botPresenceSettings)
    .where(eq(botPresenceSettings.id, PRESENCE_ROW_ID))
    .get();

  if (!row) return null;

  return {
    status: parseStatus(row.status),
    activityType: parseActivityType(row.activityType),
    activityName: row.activityName ?? "",
    streamUrl: row.streamUrl,
    state: row.state ?? "",
  };
}

export function savePersistedPresence(data: PersistedPresence): void {
  const db = getDb();
  const now = new Date();
  db.insert(botPresenceSettings)
    .values({
      id: PRESENCE_ROW_ID,
      status: data.status,
      activityType: data.activityType,
      activityName: data.activityName,
      streamUrl: data.streamUrl,
      state: data.state,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: botPresenceSettings.id,
      set: {
        status: data.status,
        activityType: data.activityType,
        activityName: data.activityName,
        streamUrl: data.streamUrl,
        state: data.state,
        updatedAt: now,
      },
    })
    .run();
}

function buildActivities(data: PersistedPresence): ActivitiesOptions[] {
  const activityName = data.activityName.trim();
  if (!activityName) return [];

  const type = data.activityType;
  const state = trimOrEmpty(data.state) || undefined;

  if (type === "Streaming") {
    return [
      {
        name: activityName.slice(0, 128),
        type: ActivityType.Streaming,
        url: validateStreamUrl(data.streamUrl ?? ""),
        state,
      },
    ];
  }

  if (type === "Custom") {
    return [
      {
        name: "Custom Status",
        type: ActivityType.Custom,
        state: activityName.slice(0, 128),
      },
    ];
  }

  return [
    {
      name: activityName.slice(0, 128),
      type: ACTIVITY_TO_DJS[type],
      state,
    },
  ];
}

/** Aplica presencia a Discord vía setPresence. */
export function applyPresenceToClient(
  bot: Client,
  data: PersistedPresence,
): void {
  assertBotReady(bot);
  bot.user!.setPresence({
    status: STATUS_TO_DJS[data.status],
    activities: buildActivities(data),
  });
}

/** Reaplica presencia guardada tras `ready` / reinicio. */
export function restorePersistedPresence(bot: Client): void {
  try {
    const saved = readPersistedPresence();
    if (!saved) {
      console.log("[adobos] Sin presencia persistida; se omite restore.");
      return;
    }
    applyPresenceToClient(bot, saved);
    console.log(
      `[adobos] Presencia restaurada: ${saved.status} / ${saved.activityType} "${saved.activityName}"`,
    );
  } catch (error: unknown) {
    console.error("[adobos] No se pudo restaurar la presencia:", error);
  }
}

function activityFromPersisted(
  data: PersistedPresence,
): BotProfileActivity | null {
  const name = data.activityName.trim();
  if (!name) return null;

  return {
    name,
    type: data.activityType,
    url: data.streamUrl,
    state: data.state.trim() || null,
  };
}

export async function getBotProfile(bot: Client): Promise<BotProfileResponse> {
  assertBotReady(bot);

  const user = await bot.user!.fetch(true);
  const persisted = readPersistedPresence();

  return {
    id: user.id,
    username: user.username,
    tag: user.tag,
    avatarUrl: user.displayAvatarURL({
      size: 256,
      extension: "png",
      forceStatic: false,
    }),
    bannerUrl: user.bannerURL({ size: 512 }) ?? null,
    accentColor: user.accentColor ?? null,
    status: persisted?.status ?? "online",
    activity: persisted ? activityFromPersisted(persisted) : null,
    applicationId: bot.application?.id ?? null,
  };
}

function fieldsToPersisted(
  fields: UpdateBotProfileRequest,
  previous: PersistedPresence | null,
): PersistedPresence {
  const clear = fields.clearActivity === true;
  const activityName = clear
    ? ""
    : trimOrEmpty(fields.activityName ?? previous?.activityName ?? "");

  let activityType = parseActivityType(
    fields.activityType ?? previous?.activityType ?? "Playing",
  );
  if (fields.activityType) {
    if (!BOT_ACTIVITY_TYPES.includes(fields.activityType)) {
      throw new BotProfileError(
        "activityType no reconocido.",
        400,
        "INVALID_ACTIVITY_TYPE",
      );
    }
    activityType = fields.activityType;
  }

  let status = previous?.status ?? "online";
  if (fields.status !== undefined) {
    if (!BOT_PRESENCE_STATUSES.includes(fields.status)) {
      throw new BotProfileError(
        "status debe ser online, idle, dnd o invisible.",
        400,
        "INVALID_STATUS",
      );
    }
    status = fields.status;
  }

  const state = clear
    ? ""
    : trimOrEmpty(fields.state ?? previous?.state ?? "");

  let streamUrl: string | null = previous?.streamUrl ?? null;
  if (fields.streamUrl !== undefined) {
    streamUrl = fields.streamUrl.trim() || null;
  }
  if (activityType === "Streaming" && activityName) {
    streamUrl = validateStreamUrl(streamUrl ?? fields.streamUrl ?? "");
  } else if (activityType !== "Streaming") {
    streamUrl = null;
  }

  return {
    status,
    activityType,
    activityName,
    streamUrl,
    state,
  };
}

function mapDiscordError(error: unknown): never {
  if (error instanceof BotProfileError) throw error;

  if (error instanceof DiscordAPIError) {
    const msg = String(error.message ?? "");
    const isRate =
      error.status === 429 ||
      error.code === 429 ||
      /rate.?limit/i.test(msg) ||
      /too many/i.test(msg);

    if (isRate || /username.*(change|limit|hour)/i.test(msg)) {
      throw new BotProfileError(
        "Discord limitó el cambio de nombre de usuario (suele ser ~2 veces por hora). Espera un rato e inténtalo de nuevo.",
        429,
        "USERNAME_RATE_LIMIT",
      );
    }

    if (error.status === 400 || error.code === 50035) {
      throw new BotProfileError(
        msg || "Discord rechazó los datos del perfil.",
        400,
        "DISCORD_INVALID",
      );
    }

    throw new BotProfileError(
      msg || "Discord rechazó la actualización del perfil.",
      typeof error.status === "number" && error.status >= 400
        ? error.status
        : 502,
      "DISCORD_API_ERROR",
    );
  }

  throw error;
}

export interface UpdateBotProfileOptions {
  fields: UpdateBotProfileRequest;
  avatarBuffer?: Buffer;
  avatarMime?: string;
}

export async function updateBotProfile(
  bot: Client,
  options: UpdateBotProfileOptions,
): Promise<UpdateBotProfileResponse> {
  assertBotReady(bot);
  const user = bot.user!;
  const { fields, avatarBuffer } = options;

  const changed = {
    username: false,
    avatar: false,
    presence: false,
  };

  try {
    if (avatarBuffer && avatarBuffer.length > 0) {
      await user.setAvatar(avatarBuffer);
      changed.avatar = true;
    }

    const nextUsername = fields.username?.trim();
    if (nextUsername && nextUsername !== user.username) {
      if (nextUsername.length < 2 || nextUsername.length > 32) {
        throw new BotProfileError(
          "El nombre de usuario debe tener entre 2 y 32 caracteres.",
          400,
          "INVALID_USERNAME",
        );
      }
      await user.setUsername(nextUsername);
      changed.username = true;
    }

    const previous = readPersistedPresence();
    const persisted = fieldsToPersisted(fields, previous);
    savePersistedPresence(persisted);
    applyPresenceToClient(bot, persisted);
    changed.presence = true;
  } catch (error: unknown) {
    mapDiscordError(error);
  }

  return {
    ok: true,
    profile: await getBotProfile(bot),
    changed,
  };
}
