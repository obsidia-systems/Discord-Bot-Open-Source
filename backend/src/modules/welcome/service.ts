import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type {
  SaveWelcomeSettingsRequest,
  SaveWelcomeSettingsResponse,
  WelcomeTextLayer,
  WelcomeTextWeight,
  WelcomeSettingsResponse,
} from "@adobos/shared";
import { getDb, one } from "../../db/client.js";
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

export const FONT_SIZE_MIN = 20;
export const FONT_SIZE_MAX = 200;

/** Persistido en DB por compatibilidad; el módulo es siempre canvas. */
const WELCOME_MODE_CARD = "card";

const DEFAULT_LAYERS: WelcomeTextLayer[] = [
  {
    id: "default-primary",
    text: "¡Bienvenido a {server}!",
    x: Math.round(CARD_WIDTH / 2),
    y: 560,
    fontSize: 64,
    color: "#FFFFFF",
    weight: "bold",
  },
  {
    id: "default-secondary",
    text: "{username}",
    x: Math.round(CARD_WIDTH / 2),
    y: 640,
    fontSize: 35,
    color: "#FFFFFF",
    weight: "normal",
  },
];

const DEFAULTS = {
  backgroundUrl: WELCOME_CARD_DEFAULT_BACKGROUND,
  bgFilepath: null as string | null,
  blurAmount: 4,
  messageContent: "{user}",
  avatarX: Math.round(CARD_WIDTH / 2),
  avatarY: 380,
  avatarSize: AVATAR_SIZE_MIN,
  avatarBorderWidth: 8,
  avatarBorderColor: "#FFFFFF",
  textLayers: DEFAULT_LAYERS,
} as const;

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
  const value = raw?.trim() || DEFAULTS.avatarBorderColor;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  throw new WelcomeSettingsError(
    "Color debe ser un hex #RRGGBB.",
    400,
    "INVALID_COLOR",
  );
}

function normalizeWeight(raw: unknown): WelcomeTextWeight {
  return raw === "normal" ? "normal" : "bold";
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
    FONT_SIZE_MIN,
    FONT_SIZE_MAX,
    64,
  );
  const textX = clamp(row.textX ?? CARD_WIDTH / 2, 0, CARD_WIDTH, CARD_WIDTH / 2);
  const textY = clamp(row.textY ?? 560, 0, CARD_HEIGHT, 560);
  const color =
    row.textColor && /^#?[0-9a-fA-F]{6}$/.test(row.textColor.trim())
      ? row.textColor.startsWith("#")
        ? row.textColor
        : `#${row.textColor}`
      : "#FFFFFF";

  return [
    {
      id: "migrated-primary",
      text: row.primaryText?.trim() || "¡Bienvenido a {server}!",
      x: textX,
      y: textY,
      fontSize,
      color,
      weight: "bold",
    },
    {
      id: "migrated-secondary",
      text: row.secondaryText?.trim() || "{username}",
      x: textX,
      y: textY + fontSize + 16,
      fontSize: Math.max(12, Math.round(fontSize * 0.55)),
      color,
      weight: "normal",
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
        return normalizeTextLayers(parsed);
      }
    } catch {
      // fallback
    }
  }
  if (legacy) return layersFromLegacy(legacy);
  return DEFAULT_LAYERS.map((layer) => ({ ...layer }));
}

export function normalizeTextLayers(raw: unknown[]): WelcomeTextLayer[] {
  const layers: WelcomeTextLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text.trim().slice(0, 200) : "";
    if (!text) continue;
    layers.push({
      id:
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim().slice(0, 64)
          : randomUUID().slice(0, 8),
      text,
      x: clamp(Number(row.x), 0, CARD_WIDTH, CARD_WIDTH / 2),
      y: clamp(Number(row.y), 0, CARD_HEIGHT, 560),
      fontSize: clamp(Number(row.fontSize), FONT_SIZE_MIN, FONT_SIZE_MAX, 64),
      color: (() => {
        try {
          return normalizeHexColor(
            typeof row.color === "string" ? row.color : "#FFFFFF",
          );
        } catch {
          return "#FFFFFF";
        }
      })(),
      weight: normalizeWeight(row.weight),
    });
  }
  return layers.length > 0 ? layers.slice(0, 12) : DEFAULT_LAYERS.map((l) => ({ ...l }));
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const db = getDb();
  const existing = await one(
    db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1)
  );

  if (!existing) {
    await db.insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
  }
}

export async function getWelcomeSettings(guildIdRaw?: string): Promise<WelcomeSettingsResponse> {
  const guildId = assertSnowflake(
    guildIdRaw?.trim() || "",
    "guildId",
  );

  const row = await one(getDb()
    .select()
    .from(welcomeSettings)
    .where(eq(welcomeSettings.guildId, guildId))
    .limit(1));

  if (!row) {
    return {
      guildId,
      channelId: null,
      isEnabled: false,
      ...DEFAULTS,
      textLayers: DEFAULT_LAYERS.map((layer) => ({ ...layer })),
    };
  }

  return {
    guildId: row.guildId,
    channelId: row.channelId,
    isEnabled: row.isEnabled,
    backgroundUrl: row.backgroundUrl?.trim() || DEFAULTS.backgroundUrl,
    bgFilepath: row.bgFilepath?.trim() || null,
    blurAmount: clampBlur(row.blurAmount),
    messageContent: row.messageContent || DEFAULTS.messageContent,
    avatarX: clamp(row.avatarX, 0, CARD_WIDTH, DEFAULTS.avatarX),
    avatarY: clamp(row.avatarY, 0, CARD_HEIGHT, DEFAULTS.avatarY),
    avatarSize: clamp(
      row.avatarSize,
      AVATAR_SIZE_MIN,
      AVATAR_SIZE_MAX,
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
): Promise<SaveWelcomeSettingsResponse> {
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelIdRaw = input.channelId?.trim() || "";
  const channelId = channelIdRaw
    ? assertSnowflake(channelIdRaw, "channelId")
    : null;
  const isEnabled = Boolean(input.isEnabled);

  if (isEnabled && !channelId) {
    throw new WelcomeSettingsError(
      "Selecciona un canal de destino para activar el módulo.",
      400,
      "MISSING_CHANNEL",
    );
  }
  const blurAmount = clampBlur(input.blurAmount);
  const messageContent = (input.messageContent ?? "{user}").trim().slice(0, 500);
  const avatarX = clamp(input.avatarX, 0, CARD_WIDTH, DEFAULTS.avatarX);
  const avatarY = clamp(input.avatarY, 0, CARD_HEIGHT, DEFAULTS.avatarY);
  const avatarSize = clamp(
    input.avatarSize,
    AVATAR_SIZE_MIN,
    AVATAR_SIZE_MAX,
    DEFAULTS.avatarSize,
  );
  const avatarBorderWidth = clamp(input.avatarBorderWidth, 0, 40, 8);
  const avatarBorderColor = normalizeHexColor(input.avatarBorderColor);
  const textLayers = normalizeTextLayers(
    Array.isArray(input.textLayers) ? input.textLayers : [],
  );

  let bgFilepath = input.bgFilepath?.trim() || null;
  if (bgFilepath && !resolvePublicUploadPath(bgFilepath)) {
    throw new WelcomeSettingsError(
      "bgFilepath inválido. Debe ser /uploads/backgrounds/...",
      400,
      "INVALID_BG_FILEPATH",
    );
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
      "Necesitas un fondo para activar la tarjeta de bienvenida.",
      400,
      "MISSING_BACKGROUND",
    );
  }

  await ensureGuildRow(guildId);

  const first = textLayers[0];
  const second = textLayers[1];

  const db = getDb();
  const now = new Date();
  const payload = {
    channelId,
    isEnabled,
    welcomeMode: WELCOME_MODE_CARD,
    backgroundUrl,
    bgFilepath,
    blurAmount,
    messageContent,
    avatarX,
    avatarY,
    avatarSize,
    avatarBorderWidth,
    avatarBorderColor,
    textLayers: JSON.stringify(textLayers),
    // Legacy mirrors (primera/segunda capa)
    primaryText: first?.text ?? "¡Bienvenido!",
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
    .limit(1)
  );

  if (existing) {
    await db.update(welcomeSettings)
      .set(payload)
      .where(eq(welcomeSettings.guildId, guildId))
      ;
  } else {
    await db.insert(welcomeSettings)
      .values({
        guildId,
        ...payload,
      })
      ;
  }

  await db.update(guildSettings)
    .set({ welcomeEnabled: isEnabled, updatedAt: now })
    .where(eq(guildSettings.guildId, guildId))
    ;

  return { ok: true };
}

export async function disableWelcomeSettings(guildId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.update(welcomeSettings)
    .set({ isEnabled: false, updatedAt: now })
    .where(eq(welcomeSettings.guildId, guildId))
    ;
  await db.update(guildSettings)
    .set({ welcomeEnabled: false, updatedAt: now })
    .where(eq(guildSettings.guildId, guildId))
    ;
}
