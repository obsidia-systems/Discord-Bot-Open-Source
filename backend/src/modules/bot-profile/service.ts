import fs from "node:fs";
import type {
  BotActivityTypeName,
  BotGuildProfileResponse,
  BotPresenceStatus,
  UpdateBotGuildProfileRequest,
  UpdateBotGuildProfileResponse,
} from "@adobos/shared";
import {
  BOT_GUILD_NICKNAME_MAX,
  isBotGuildNicknameTooLong,
  parseBotActivityType,
  parseBotPresenceStatus,
} from "@adobos/shared";
import {
  type ActivitiesOptions,
  type ActivityType,
  type Client,
  DiscordAPIError,
  type Guild,
  type PresenceStatusData,
  PresenceUpdateStatus,
} from "discord.js";
import { eq } from "drizzle-orm";
import { logger } from "#core/log.js";
import { getDb, one } from "#db/client.js";
import { botPresenceSettings } from "#db/schema.js";
import { resolvePublicUploadPath } from "#lib/dataPaths.js";

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

interface PersistedPresence {
  status: BotPresenceStatus;
  activityType: BotActivityTypeName;
  activityName: string;
  streamUrl: string | null;
  state: string;
}

const STATUS_TO_DJS: Record<BotPresenceStatus, PresenceStatusData> = {
  online: PresenceUpdateStatus.Online,
  idle: PresenceUpdateStatus.Idle,
  dnd: PresenceUpdateStatus.DoNotDisturb,
  invisible: PresenceUpdateStatus.Invisible,
};

const ACTIVITY_TYPE_MAP: Record<BotActivityTypeName, number> = {
  Playing: 0,
  Streaming: 1,
  Listening: 2,
  Watching: 3,
  Custom: 4,
  Competing: 5,
};

function assertBotReady(bot: Client): void {
  if (!bot.isReady() || !bot.user) {
    throw new BotProfileError(
      "The Discord bot is not connected.",
      503,
      "BOT_NOT_READY",
    );
  }
}

function resolveGuild(bot: Client, guildId?: string): Guild {
  assertBotReady(bot);
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new BotProfileError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }
  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new BotProfileError(
      "The bot is not in that server.",
      404,
      "GUILD_NOT_FOUND",
    );
  }
  return guild;
}

export async function readPersistedPresence(): Promise<PersistedPresence | null> {
  const db = getDb();
  const row = await one(
    db
      .select()
      .from(botPresenceSettings)
      .where(eq(botPresenceSettings.id, PRESENCE_ROW_ID))
      .limit(1),
  );

  if (!row) return null;

  return {
    status: parseBotPresenceStatus(row.status),
    activityType: parseBotActivityType(row.activityType),
    activityName: row.activityName ?? "",
    streamUrl: row.streamUrl,
    state: row.state ?? "",
  };
}

function buildActivities(data: PersistedPresence): ActivitiesOptions[] {
  const activityName = data.activityName.trim();
  if (!activityName) return [];

  const type = data.activityType;
  const state = data.state.trim() || undefined;

  if (type === "Streaming" && data.streamUrl) {
    return [
      {
        name: activityName.slice(0, 128),
        type: ACTIVITY_TYPE_MAP.Streaming as ActivityType,
        url: data.streamUrl,
        state,
      },
    ];
  }

  if (type === "Custom") {
    return [
      {
        name: "Custom Status",
        type: ACTIVITY_TYPE_MAP.Custom as ActivityType,
        state: activityName.slice(0, 128),
      },
    ];
  }

  return [
    {
      name: activityName.slice(0, 128),
      type: ACTIVITY_TYPE_MAP[type] as ActivityType,
      state,
    },
  ];
}

/** Reaplica presencia guardada tras `ready` / reinicio (sin UI global). */
export async function restorePersistedPresence(bot: Client): Promise<void> {
  try {
    if (!bot.isReady() || !bot.user) return;
    const saved = await readPersistedPresence();
    if (!saved) {
      logger.info("No persisted presence; skipping restore.");
      return;
    }
    bot.user.setPresence({
      status: STATUS_TO_DJS[saved.status],
      activities: buildActivities(saved),
    });
    logger.info(
      `Presence restored: ${saved.status} / ${saved.activityType} "${saved.activityName}"`,
    );
  } catch (error: unknown) {
    logger.error({ err: error }, "Couldn't restore the presence:");
  }
}

function mapMemberToProfile(
  guild: Guild,
  me: NonNullable<Guild["members"]["me"]>,
): BotGuildProfileResponse {
  const serverAvatarURL =
    me.avatarURL({ size: 256, extension: "png", forceStatic: true }) ?? null;
  const globalAvatarURL = me.user.displayAvatarURL({
    size: 256,
    extension: "png",
    forceStatic: true,
  });

  return {
    guildId: guild.id,
    guildName: guild.name,
    nickname: me.nickname ?? "",
    displayName: me.displayName,
    username: me.user.username,
    tag: me.user.tag,
    serverAvatarURL,
    globalAvatarURL,
    hasServerAvatar: Boolean(me.avatar),
  };
}

export async function getGuildBotProfile(
  bot: Client,
  guildId?: string,
): Promise<BotGuildProfileResponse> {
  const guild = resolveGuild(bot, guildId);
  const me = await guild.members.fetchMe({ force: true });
  return mapMemberToProfile(guild, me);
}

/** @deprecated alias */
export async function getBotProfile(
  bot: Client,
  guildId?: string,
): Promise<BotGuildProfileResponse> {
  return await getGuildBotProfile(bot, guildId);
}

function mapDiscordError(error: unknown): never {
  if (error instanceof BotProfileError) throw error;

  if (error instanceof DiscordAPIError) {
    const msg = String(error.message ?? "");
    if (
      error.code === 50013 ||
      error.status === 403 ||
      /missing.?access|missing.?permissions|privilege/i.test(msg)
    ) {
      throw new BotProfileError(
        "The bot lacks sufficient permissions in this server to change its nickname or avatar.",
        403,
        "MISSING_PERMISSIONS",
      );
    }

    if (error.status === 400 || error.code === 50035) {
      throw new BotProfileError(
        msg || "Discord rejected the server profile data.",
        400,
        "DISCORD_INVALID",
      );
    }

    throw new BotProfileError(
      msg || "Discord rejected the server profile update.",
      typeof error.status === "number" && error.status >= 400
        ? error.status
        : 502,
      "DISCORD_API_ERROR",
    );
  }

  throw error;
}

/**
 * Resuelve avatar a Buffer / URL / null (limpiar) / undefined (sin cambio).
 */
async function resolveServerAvatarInput(options: {
  clear?: boolean;
  fileBuffer?: Buffer;
  urlOrPath?: string | null;
}): Promise<Buffer | string | null | undefined> {
  if (options.clear) return null;
  if (options.fileBuffer && options.fileBuffer.length > 0) {
    return options.fileBuffer;
  }

  const raw = options.urlOrPath?.trim();
  if (!raw) return undefined;

  if (raw.startsWith("/uploads/")) {
    const absolute = resolvePublicUploadPath(raw);
    if (!absolute || !fs.existsSync(absolute)) {
      throw new BotProfileError(
        "The uploaded avatar image was not found.",
        400,
        "AVATAR_FILE_MISSING",
      );
    }
    return fs.readFileSync(absolute);
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  throw new BotProfileError(
    "serverAvatarUrl must be http(s) or a /uploads/… path",
    400,
    "INVALID_AVATAR_URL",
  );
}

export interface UpdateGuildBotProfileOptions {
  fields: UpdateBotGuildProfileRequest;
  avatarBuffer?: Buffer;
  guildId?: string;
}

export async function updateGuildBotProfile(
  bot: Client,
  options: UpdateGuildBotProfileOptions,
): Promise<UpdateBotGuildProfileResponse> {
  const guild = resolveGuild(bot, options.guildId);
  const me = await guild.members.fetchMe();
  const { fields, avatarBuffer } = options;

  const changedFlags = {
    nickname: false,
    serverAvatar: false,
  };

  try {
    const clearNickname = fields.clearNickname === true;
    const nicknameRaw = fields.nickname;
    const shouldUpdateNickname = clearNickname || nicknameRaw !== undefined;

    if (shouldUpdateNickname) {
      const nextNick = clearNickname
        ? null
        : typeof nicknameRaw === "string"
          ? nicknameRaw.trim() || null
          : null;

      if (nextNick && isBotGuildNicknameTooLong(nextNick)) {
        throw new BotProfileError(
          `The nickname must be at most ${BOT_GUILD_NICKNAME_MAX} characters.`,
          400,
          "INVALID_NICKNAME",
        );
      }

      const current = me.nickname ?? null;
      if (current !== nextNick) {
        await me.setNickname(nextNick);
        changedFlags.nickname = true;
      }
    }

    const avatarInput = await resolveServerAvatarInput({
      clear: fields.clearServerAvatar === true,
      fileBuffer: avatarBuffer,
      urlOrPath: fields.serverAvatarUrl,
    });

    if (avatarInput !== undefined) {
      // Avatar de miembro (@me): GuildMemberManager.editMe
      await guild.members.editMe({ avatar: avatarInput });
      changedFlags.serverAvatar = true;
    }
  } catch (error: unknown) {
    mapDiscordError(error);
  }

  const profile = await getGuildBotProfile(bot, guild.id);

  return {
    ok: true,
    message: "Bot profile updated for this server",
    profile,
    changed: changedFlags,
  };
}

/** @deprecated alias */
export async function updateBotProfile(
  bot: Client,
  options: UpdateGuildBotProfileOptions,
): Promise<UpdateBotGuildProfileResponse> {
  return await updateGuildBotProfile(bot, options);
}
