import { and, eq } from "drizzle-orm";
import type {
  CanvasEventSettingsResponse,
  CanvasEventType,
  SaveCanvasEventSettingsRequest,
  SaveCanvasEventSettingsResponse,
  WelcomeTextLayer,
} from "@adobos/shared";
import { CANVAS_EVENT_TYPES } from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { canvasEventSettings, guildSettings } from "../../db/schema.js";
import {
  AVATAR_SIZE_MAX,
  AVATAR_SIZE_MIN,
  CARD_HEIGHT,
  CARD_WIDTH,
  WELCOME_CARD_DEFAULT_BACKGROUND,
} from "../welcome/card/WelcomeCardBuilder.js";
import {
  normalizeTextLayers,
  parseTextLayersJson,
} from "../welcome/service.js";
import { resolvePublicUploadPath } from "../../lib/dataPaths.js";

export class CanvasEventSettingsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CanvasEventSettingsError";
  }
}

const DEFAULT_LAYERS_BY_TYPE: Record<CanvasEventType, WelcomeTextLayer[]> = {
  leave: [
    {
      id: "default-primary",
      text: "¡Hasta pronto!",
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
  ],
  ban: [
    {
      id: "default-primary",
      text: "Usuario baneado",
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
  ],
  boost: [
    {
      id: "default-primary",
      text: "¡Gracias por el boost!",
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
  ],
};

const DEFAULT_MESSAGE_BY_TYPE: Record<CanvasEventType, string> = {
  leave: "{user} abandonó el servidor. Ahora somos {membercount}.",
  ban: "{user} fue baneado del servidor.",
  boost: "{user} impulsó el servidor. ¡Gracias!",
};

function assertEventType(raw: string): CanvasEventType {
  if (CANVAS_EVENT_TYPES.includes(raw as CanvasEventType)) {
    return raw as CanvasEventType;
  }
  throw new CanvasEventSettingsError(
    "eventType inválido.",
    400,
    "INVALID_EVENT_TYPE",
  );
}

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new CanvasEventSettingsError(
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
  return clamp(amount, 0, 10, 4);
}

function normalizeHexColor(raw: string | undefined): string {
  const value = raw?.trim() || "#FFFFFF";
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  throw new CanvasEventSettingsError(
    "Color debe ser un hex #RRGGBB.",
    400,
    "INVALID_COLOR",
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

function defaultLayers(eventType: CanvasEventType): WelcomeTextLayer[] {
  return DEFAULT_LAYERS_BY_TYPE[eventType].map((layer) => ({ ...layer }));
}

export function getCanvasEventSettings(
  eventTypeRaw: string,
  guildIdRaw?: string,
): CanvasEventSettingsResponse {
  const eventType = assertEventType(eventTypeRaw);
  const guildId = assertSnowflake(
    guildIdRaw?.trim() || "",
    "guildId",
  );

  const row = getDb()
    .select()
    .from(canvasEventSettings)
    .where(
      and(
        eq(canvasEventSettings.guildId, guildId),
        eq(canvasEventSettings.eventType, eventType),
      ),
    )
    .get();

  if (!row) {
    return {
      guildId,
      channelId: null,
      isEnabled: false,
      backgroundUrl: WELCOME_CARD_DEFAULT_BACKGROUND,
      bgFilepath: null,
      blurAmount: 4,
      messageContent: DEFAULT_MESSAGE_BY_TYPE[eventType],
      avatarX: Math.round(CARD_WIDTH / 2),
      avatarY: 380,
      avatarSize: AVATAR_SIZE_MIN,
      avatarBorderWidth: 8,
      avatarBorderColor: "#FFFFFF",
      textLayers: defaultLayers(eventType),
    };
  }

  return {
    guildId: row.guildId,
    channelId: row.channelId,
    isEnabled: row.isEnabled,
    backgroundUrl: row.backgroundUrl?.trim() || WELCOME_CARD_DEFAULT_BACKGROUND,
    bgFilepath: row.bgFilepath?.trim() || null,
    blurAmount: clampBlur(row.blurAmount),
    messageContent: row.messageContent || DEFAULT_MESSAGE_BY_TYPE[eventType],
    avatarX: clamp(row.avatarX, 0, CARD_WIDTH, CARD_WIDTH / 2),
    avatarY: clamp(row.avatarY, 0, CARD_HEIGHT, 380),
    avatarSize: clamp(
      row.avatarSize,
      AVATAR_SIZE_MIN,
      AVATAR_SIZE_MAX,
      AVATAR_SIZE_MIN,
    ),
    avatarBorderWidth: clamp(row.avatarBorderWidth ?? 8, 0, 40, 8),
    avatarBorderColor: row.avatarBorderColor || "#FFFFFF",
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

export function saveCanvasEventSettings(
  eventTypeRaw: string,
  input: SaveCanvasEventSettingsRequest,
): SaveCanvasEventSettingsResponse {
  const eventType = assertEventType(eventTypeRaw);
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelIdRaw = input.channelId?.trim() || "";
  const channelId = channelIdRaw
    ? assertSnowflake(channelIdRaw, "channelId")
    : null;
  const isEnabled = Boolean(input.isEnabled);

  if (isEnabled && !channelId) {
    throw new CanvasEventSettingsError(
      "Selecciona un canal de destino para activar el módulo.",
      400,
      "MISSING_CHANNEL",
    );
  }
  const blurAmount = clampBlur(input.blurAmount);
  const messageContent = (
    input.messageContent ?? DEFAULT_MESSAGE_BY_TYPE[eventType]
  )
    .trim()
    .slice(0, 500);
  const avatarX = clamp(input.avatarX, 0, CARD_WIDTH, CARD_WIDTH / 2);
  const avatarY = clamp(input.avatarY, 0, CARD_HEIGHT, 380);
  const avatarSize = clamp(
    input.avatarSize,
    AVATAR_SIZE_MIN,
    AVATAR_SIZE_MAX,
    AVATAR_SIZE_MIN,
  );
  const avatarBorderWidth = clamp(input.avatarBorderWidth, 0, 40, 8);
  const avatarBorderColor = normalizeHexColor(input.avatarBorderColor);
  const textLayers = normalizeTextLayers(
    Array.isArray(input.textLayers) ? input.textLayers : [],
  );

  let bgFilepath = input.bgFilepath?.trim() || null;
  if (bgFilepath && !resolvePublicUploadPath(bgFilepath)) {
    throw new CanvasEventSettingsError(
      "bgFilepath inválido. Debe ser /uploads/backgrounds/...",
      400,
      "INVALID_BG_FILEPATH",
    );
  }

  let backgroundUrl =
    (input.backgroundUrl ?? "").trim() || WELCOME_CARD_DEFAULT_BACKGROUND;
  if (backgroundUrl && !isHttpUrl(backgroundUrl) && !bgFilepath) {
    throw new CanvasEventSettingsError(
      "La URL de fondo debe ser http(s) o sube un archivo.",
      400,
      "INVALID_BACKGROUND_URL",
    );
  }
  if (!isHttpUrl(backgroundUrl)) {
    backgroundUrl = WELCOME_CARD_DEFAULT_BACKGROUND;
  }

  if (isEnabled && !bgFilepath && !backgroundUrl) {
    throw new CanvasEventSettingsError(
      "Necesitas un fondo para activar la tarjeta.",
      400,
      "MISSING_BACKGROUND",
    );
  }

  ensureGuildRow(guildId);

  const first = textLayers[0];
  const second = textLayers[1];
  const db = getDb();
  const now = new Date();
  const payload = {
    channelId,
    isEnabled,
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
    primaryText: first?.text ?? DEFAULT_LAYERS_BY_TYPE[eventType][0]!.text,
    secondaryText: second?.text ?? "{username}",
    textX: first?.x ?? Math.round(CARD_WIDTH / 2),
    textY: first?.y ?? 560,
    fontSize: first?.fontSize ?? 64,
    textColor: first?.color ?? "#FFFFFF",
    updatedAt: now,
  };

  const existing = db
    .select()
    .from(canvasEventSettings)
    .where(
      and(
        eq(canvasEventSettings.guildId, guildId),
        eq(canvasEventSettings.eventType, eventType),
      ),
    )
    .get();

  if (existing) {
    db.update(canvasEventSettings)
      .set(payload)
      .where(
        and(
          eq(canvasEventSettings.guildId, guildId),
          eq(canvasEventSettings.eventType, eventType),
        ),
      )
      .run();
  } else {
    db.insert(canvasEventSettings)
      .values({
        guildId,
        eventType,
        ...payload,
      })
      .run();
  }

  return { ok: true };
}

export function disableCanvasEventSettings(
  eventType: CanvasEventType,
  guildId: string,
): void {
  getDb()
    .update(canvasEventSettings)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(canvasEventSettings.guildId, guildId),
        eq(canvasEventSettings.eventType, eventType),
      ),
    )
    .run();
}
