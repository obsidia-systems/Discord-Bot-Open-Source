import { eq } from "drizzle-orm";
import type {
  SaveWelcomeSettingsRequest,
  SaveWelcomeSettingsResponse,
  WelcomeSettingsResponse,
} from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { guildSettings, welcomeSettings } from "../../db/schema.js";
import {
  AVATAR_SIZE_MAX,
  AVATAR_SIZE_MIN,
  CARD_HEIGHT,
  CARD_WIDTH,
  WELCOME_CARD_DEFAULT_BACKGROUND,
} from "./card/WelcomeCardBuilder.js";
import { resolvePublicUploadPath } from "../../lib/dataPaths.js";

export class WelcomeSettingsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "WelcomeSettingsError";
  }
}

const DEFAULTS = {
  backgroundUrl: WELCOME_CARD_DEFAULT_BACKGROUND,
  bgFilepath: null as string | null,
  blurAmount: 4,
  primaryText: "¡Bienvenido!",
  secondaryText: "{username}",
  messageContent: "{user}",
  avatarX: Math.round(CARD_WIDTH / 2),
  avatarY: 380,
  avatarSize: AVATAR_SIZE_MIN,
  textX: Math.round(CARD_WIDTH / 2),
  textY: 560,
  fontSize: 64,
  textColor: "#FFFFFF",
} as const;

export const FONT_SIZE_MIN = 20;
export const FONT_SIZE_MAX = 200;

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new WelcomeSettingsError(
      `${field} debe ser un snowflake válido.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampBlur(amount: number): number {
  return clamp(amount, 0, 10, DEFAULTS.blurAmount);
}

function normalizeHexColor(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULTS.textColor;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  throw new WelcomeSettingsError(
    "textColor debe ser un hex #RRGGBB.",
    400,
    "INVALID_TEXT_COLOR",
  );
}

function ensureGuildRow(guildId: string): void {
  const db = getDb();
  const existing = db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();

  if (!existing) {
    db.insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
  }
}

/** Servicio de dominio welcome — sin acoplar Express ↔ Discord events. */
export function getWelcomeSettings(guildIdRaw?: string): WelcomeSettingsResponse {
  const guildId = assertSnowflake(
    guildIdRaw?.trim() || process.env.DISCORD_GUILD_ID || "",
    "guildId",
  );

  const row = getDb()
    .select()
    .from(welcomeSettings)
    .where(eq(welcomeSettings.guildId, guildId))
    .get();

  if (!row) {
    return {
      guildId,
      channelId: null,
      isEnabled: false,
      ...DEFAULTS,
    };
  }

  return {
    guildId: row.guildId,
    channelId: row.channelId,
    isEnabled: row.isEnabled,
    backgroundUrl: row.backgroundUrl?.trim() || DEFAULTS.backgroundUrl,
    bgFilepath: row.bgFilepath?.trim() || null,
    blurAmount: clampBlur(row.blurAmount),
    primaryText: row.primaryText || DEFAULTS.primaryText,
    secondaryText: row.secondaryText || DEFAULTS.secondaryText,
    messageContent: row.messageContent || DEFAULTS.messageContent,
    avatarX: clamp(row.avatarX, 0, CARD_WIDTH, DEFAULTS.avatarX),
    avatarY: clamp(row.avatarY, 0, CARD_HEIGHT, DEFAULTS.avatarY),
    avatarSize: clamp(
      row.avatarSize,
      AVATAR_SIZE_MIN,
      AVATAR_SIZE_MAX,
      DEFAULTS.avatarSize,
    ),
    textX: clamp(row.textX, 0, CARD_WIDTH, DEFAULTS.textX),
    textY: clamp(row.textY, 0, CARD_HEIGHT, DEFAULTS.textY),
    fontSize: clamp(row.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, DEFAULTS.fontSize),
    textColor: row.textColor || DEFAULTS.textColor,
  };
}

export function saveWelcomeSettings(
  input: SaveWelcomeSettingsRequest,
): SaveWelcomeSettingsResponse {
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelId = assertSnowflake(input.channelId, "channelId");
  const isEnabled = Boolean(input.isEnabled);
  const blurAmount = clampBlur(input.blurAmount);
  const primaryText =
    (input.primaryText ?? "").trim().slice(0, 80) || DEFAULTS.primaryText;
  const secondaryText =
    (input.secondaryText ?? "").trim().slice(0, 100) || DEFAULTS.secondaryText;
  const messageContent = (input.messageContent ?? "{user}").trim().slice(0, 500);
  const textColor = normalizeHexColor(input.textColor);
  const avatarX = clamp(input.avatarX, 0, CARD_WIDTH, DEFAULTS.avatarX);
  const avatarY = clamp(input.avatarY, 0, CARD_HEIGHT, DEFAULTS.avatarY);
  const avatarSize = clamp(
    input.avatarSize,
    AVATAR_SIZE_MIN,
    AVATAR_SIZE_MAX,
    DEFAULTS.avatarSize,
  );
  const textX = clamp(input.textX, 0, CARD_WIDTH, DEFAULTS.textX);
  const textY = clamp(input.textY, 0, CARD_HEIGHT, DEFAULTS.textY);
  const fontSize = clamp(
    input.fontSize,
    FONT_SIZE_MIN,
    FONT_SIZE_MAX,
    DEFAULTS.fontSize,
  );

  let bgFilepath = input.bgFilepath?.trim() || null;
  if (bgFilepath) {
    if (!resolvePublicUploadPath(bgFilepath)) {
      throw new WelcomeSettingsError(
        "bgFilepath inválido. Debe ser /uploads/backgrounds/...",
        400,
        "INVALID_BG_FILEPATH",
      );
    }
  }

  let backgroundUrl =
    (input.backgroundUrl ?? "").trim() || DEFAULTS.backgroundUrl;
  if (backgroundUrl && !isHttpUrl(backgroundUrl) && !bgFilepath) {
    throw new WelcomeSettingsError(
      "La URL de fondo debe ser http(s) o sube un archivo.",
      400,
      "INVALID_BACKGROUND_URL",
    );
  }
  if (!isHttpUrl(backgroundUrl)) {
    backgroundUrl = DEFAULTS.backgroundUrl;
  }

  if (isEnabled && !bgFilepath && !backgroundUrl) {
    throw new WelcomeSettingsError(
      "Necesitas un fondo (archivo o galería) para activar bienvenidas.",
      400,
      "MISSING_BACKGROUND",
    );
  }

  ensureGuildRow(guildId);

  const db = getDb();
  const now = new Date();
  const payload = {
    channelId,
    isEnabled,
    backgroundUrl,
    bgFilepath,
    blurAmount,
    primaryText,
    secondaryText,
    messageContent,
    avatarX,
    avatarY,
    avatarSize,
    textX,
    textY,
    fontSize,
    textColor,
    updatedAt: now,
  };

  const existing = db
    .select()
    .from(welcomeSettings)
    .where(eq(welcomeSettings.guildId, guildId))
    .get();

  if (existing) {
    db.update(welcomeSettings)
      .set(payload)
      .where(eq(welcomeSettings.guildId, guildId))
      .run();
  } else {
    db.insert(welcomeSettings)
      .values({
        guildId,
        ...payload,
      })
      .run();
  }

  db.update(guildSettings)
    .set({ welcomeEnabled: isEnabled, updatedAt: now })
    .where(eq(guildSettings.guildId, guildId))
    .run();

  return { ok: true };
}

/** Desactiva el módulo (p. ej. canal borrado). */
export function disableWelcomeSettings(guildId: string): void {
  const db = getDb();
  const now = new Date();
  db.update(welcomeSettings)
    .set({ isEnabled: false, updatedAt: now })
    .where(eq(welcomeSettings.guildId, guildId))
    .run();
  db.update(guildSettings)
    .set({ welcomeEnabled: false, updatedAt: now })
    .where(eq(guildSettings.guildId, guildId))
    .run();
}
