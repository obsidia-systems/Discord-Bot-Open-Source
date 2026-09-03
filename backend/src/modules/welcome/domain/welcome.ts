import type {
  SaveWelcomeSettingsRequest,
  SaveWelcomeSettingsResponse,
  WelcomeSettingsResponse,
  WelcomeTextLayer,
} from "@adobos/shared";
import {
  defaultWelcomeTextLayers,
  isWelcomeRemoteBackground,
  normalizeTextLayers,
  WELCOME_AVATAR_SIZE_MAX,
  WELCOME_AVATAR_SIZE_MIN,
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
  WELCOME_FONT_SIZE_MAX,
  WELCOME_FONT_SIZE_MIN,
} from "@adobos/shared";
import type { Client } from "discord.js";
import { eq } from "drizzle-orm";
import { getDb, one } from "#db/client.js";
import { guildSettings, welcomeSettings } from "#db/schema.js";
import { resolvePublicUploadPath } from "#lib/dataPaths.js";
import { assertGuildWelcomeChannel } from "../channel.js";

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

export const FONT_SIZE_MIN = WELCOME_FONT_SIZE_MIN;
export const FONT_SIZE_MAX = WELCOME_FONT_SIZE_MAX;

/** Persistido en DB por compatibilidad; el módulo es siempre canvas. */
const WELCOME_MODE_CARD = "card";

const DEFAULTS = {
  backgroundUrl: "",
  bgFilepath: null as string | null,
  blurAmount: 4,
  messageContent: "{user}",
  avatarX: Math.round(WELCOME_CARD_WIDTH / 2),
  avatarY: 380,
  avatarSize: WELCOME_AVATAR_SIZE_MIN,
  avatarBorderWidth: 8,
  avatarBorderColor: "#FFFFFF",
} as const;

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new WelcomeSettingsError(
      `${field} must be a valid snowflake.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

function clamp(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampBlur(amount: number): number {
  return clamp(amount, 0, 10, DEFAULTS.blurAmount);
}

function normalizeHexColor(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULTS.avatarBorderColor;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  throw new WelcomeSettingsError(
    "Color must be a #RRGGBB hex.",
    400,
    "INVALID_COLOR",
  );
}

function layersFromLegacy(row: {
  primaryText?: string | null;
  secondaryText?: string | null;
  textX?: number | null;
  textY?: number | null;
  fontSize?: number | null;
  textColor?: string | null;
}): WelcomeTextLayer[] {
  const fontSize = clamp(
    row.fontSize ?? 64,
    WELCOME_FONT_SIZE_MIN,
    WELCOME_FONT_SIZE_MAX,
    64,
  );
  const textX = clamp(
    row.textX ?? WELCOME_CARD_WIDTH / 2,
    0,
    WELCOME_CARD_WIDTH,
    WELCOME_CARD_WIDTH / 2,
  );
  const textY = clamp(row.textY ?? 560, 0, WELCOME_CARD_HEIGHT, 560);
  const color =
    row.textColor && /^#?[0-9a-fA-F]{6}$/.test(row.textColor.trim())
      ? row.textColor.startsWith("#")
        ? row.textColor
        : `#${row.textColor}`
      : "#FFFFFF";

  return [
    {
      id: "migrated-primary",
      text: row.primaryText?.trim() || "Welcome to {server}!",
      x: textX,
      y: textY,
      fontSize,
      color,
      weight: "bold",
      align: "left",
    },
    {
      id: "migrated-secondary",
      text: row.secondaryText?.trim() || "{username}",
      x: textX,
      y: textY + fontSize + 16,
      fontSize: Math.max(12, Math.round(fontSize * 0.55)),
      color,
      weight: "normal",
      align: "left",
    },
  ];
}

export function parseTextLayersJson(
  raw: string | null | undefined,
  legacy?: {
    primaryText?: string | null;
    secondaryText?: string | null;
    textX?: number | null;
    textY?: number | null;
    fontSize?: number | null;
    textColor?: string | null;
  },
): WelcomeTextLayer[] {
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const layers = normalizeTextLayers(parsed);
        if (layers.length > 0) return layers;
      }
    } catch {
      // fallback
    }
  }
  if (legacy) return layersFromLegacy(legacy);
  return defaultWelcomeTextLayers();
}

export { normalizeTextLayers };

async function ensureGuildRow(guildId: string): Promise<void> {
  const db = getDb();
  const existing = await one(
    db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );

  if (!existing) {
    await db.insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

function storedBackgroundUrl(raw: string | null | undefined): string {
  const trimmed = raw?.trim() || "";
  return isWelcomeRemoteBackground(trimmed) ? trimmed : "";
}

export async function getWelcomeSettings(
  guildIdRaw?: string,
): Promise<WelcomeSettingsResponse> {
  const guildId = assertSnowflake(guildIdRaw?.trim() || "", "guildId");

  const row = await one(
    getDb()
      .select()
      .from(welcomeSettings)
      .where(eq(welcomeSettings.guildId, guildId))
      .limit(1),
  );

  if (!row) {
    return {
      guildId,
      channelId: null,
      isEnabled: false,
      ...DEFAULTS,
      textLayers: defaultWelcomeTextLayers(),
    };
  }

  return {
    guildId: row.guildId,
    channelId: row.channelId,
    isEnabled: row.isEnabled,
    backgroundUrl: storedBackgroundUrl(row.backgroundUrl),
    bgFilepath: row.bgFilepath?.trim() || null,
    blurAmount: clampBlur(row.blurAmount),
    messageContent: row.messageContent || DEFAULTS.messageContent,
    avatarX: clamp(row.avatarX, 0, WELCOME_CARD_WIDTH, DEFAULTS.avatarX),
    avatarY: clamp(row.avatarY, 0, WELCOME_CARD_HEIGHT, DEFAULTS.avatarY),
    avatarSize: clamp(
      row.avatarSize,
      WELCOME_AVATAR_SIZE_MIN,
      WELCOME_AVATAR_SIZE_MAX,
      DEFAULTS.avatarSize,
    ),
    avatarBorderWidth: clamp(row.avatarBorderWidth ?? 8, 0, 40, 8),
    avatarBorderColor: row.avatarBorderColor || DEFAULTS.avatarBorderColor,
    textLayers: parseTextLayersJson(row.textLayers, {
      primaryText: row.primaryText,
      secondaryText: row.secondaryText,
      textX: row.textX,
      textY: row.textY,
      fontSize: row.fontSize,
      textColor: row.textColor,
    }),
  };
}

export async function saveWelcomeSettings(
  input: SaveWelcomeSettingsRequest,
  bot: Client,
): Promise<SaveWelcomeSettingsResponse> {
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelIdRaw = input.channelId?.trim() || "";
  const channelId = channelIdRaw
    ? assertSnowflake(channelIdRaw, "channelId")
    : null;
  const isEnabled = Boolean(input.isEnabled);

  if (isEnabled && !channelId) {
    throw new WelcomeSettingsError(
      "Select a destination channel to enable the module.",
      400,
      "MISSING_CHANNEL",
    );
  }
  if (channelId) {
    await assertGuildWelcomeChannel(bot, guildId, channelId);
  }

  const blurAmount = clampBlur(input.blurAmount);
  const messageContent = (input.messageContent ?? "{user}")
    .trim()
    .slice(0, 500);
  const avatarX = clamp(input.avatarX, 0, WELCOME_CARD_WIDTH, DEFAULTS.avatarX);
  const avatarY = clamp(
    input.avatarY,
    0,
    WELCOME_CARD_HEIGHT,
    DEFAULTS.avatarY,
  );
  const avatarSize = clamp(
    input.avatarSize,
    WELCOME_AVATAR_SIZE_MIN,
    WELCOME_AVATAR_SIZE_MAX,
    DEFAULTS.avatarSize,
  );
  const avatarBorderWidth = clamp(input.avatarBorderWidth, 0, 40, 8);
  const avatarBorderColor = normalizeHexColor(input.avatarBorderColor);
  const textLayers = normalizeTextLayers(
    Array.isArray(input.textLayers) ? input.textLayers : [],
  );
  const resolvedLayers =
    textLayers.length > 0 ? textLayers : defaultWelcomeTextLayers();

  const bgFilepath = input.bgFilepath?.trim() || null;
  if (bgFilepath && !resolvePublicUploadPath(bgFilepath)) {
    throw new WelcomeSettingsError(
      "Invalid bgFilepath. It must be /uploads/backgrounds/...",
      400,
      "INVALID_BG_FILEPATH",
    );
  }

  const backgroundUrl = storedBackgroundUrl(input.backgroundUrl);

  await ensureGuildRow(guildId);

  const first = resolvedLayers[0];
  const second = resolvedLayers[1];

  const db = getDb();
  const now = new Date();
  const payload = {
    channelId,
    isEnabled,
    welcomeMode: WELCOME_MODE_CARD,
    backgroundUrl: backgroundUrl || null,
    bgFilepath,
    blurAmount,
    messageContent,
    avatarX,
    avatarY,
    avatarSize,
    avatarBorderWidth,
    avatarBorderColor,
    textLayers: JSON.stringify(resolvedLayers),
    primaryText: first?.text ?? "Welcome!",
    secondaryText: second?.text ?? "{username}",
    textX: first?.x ?? DEFAULTS.avatarX,
    textY: first?.y ?? 560,
    fontSize: first?.fontSize ?? 64,
    textColor: first?.color ?? "#FFFFFF",
    updatedAt: now,
  };

  const existing = await one(
    db
      .select()
      .from(welcomeSettings)
      .where(eq(welcomeSettings.guildId, guildId))
      .limit(1),
  );

  if (existing) {
    await db
      .update(welcomeSettings)
      .set(payload)
      .where(eq(welcomeSettings.guildId, guildId));
  } else {
    await db.insert(welcomeSettings).values({
      guildId,
      ...payload,
    });
  }

  await db
    .update(guildSettings)
    .set({ welcomeEnabled: isEnabled, updatedAt: now })
    .where(eq(guildSettings.guildId, guildId));

  return { ok: true };
}

export async function disableWelcomeSettings(guildId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(welcomeSettings)
    .set({ isEnabled: false, updatedAt: now })
    .where(eq(welcomeSettings.guildId, guildId));
  await db
    .update(guildSettings)
    .set({ welcomeEnabled: false, updatedAt: now })
    .where(eq(guildSettings.guildId, guildId));
}
