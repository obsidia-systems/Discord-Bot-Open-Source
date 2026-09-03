import type {
  CanvasEventSettingsResponse,
  CanvasEventType,
  SaveCanvasEventSettingsRequest,
  SaveCanvasEventSettingsResponse,
  WelcomeTextLayer,
} from "@adobos/shared";
import {
  CANVAS_EVENT_TYPES,
  isWelcomeRemoteBackground,
  WELCOME_AVATAR_SIZE_MAX,
  WELCOME_AVATAR_SIZE_MIN,
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
} from "@adobos/shared";
import { and, eq } from "drizzle-orm";
import { getDb, one } from "#db/client.js";
import { canvasEventSettings, guildSettings } from "#db/schema.js";
import { resolvePublicUploadPath } from "#lib/dataPaths.js";
import {
  normalizeTextLayers,
  parseTextLayersJson,
} from "#modules/welcome/domain/welcome.js";

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
      text: "See you soon!",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 560,
      fontSize: 64,
      color: "#FFFFFF",
      weight: "bold",
      align: "center" as const,
    },
    {
      id: "default-secondary",
      text: "{username}",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 640,
      fontSize: 35,
      color: "#FFFFFF",
      weight: "normal",
      align: "center" as const,
    },
  ],
  ban: [
    {
      id: "default-primary",
      text: "User banned",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 560,
      fontSize: 64,
      color: "#FFFFFF",
      weight: "bold",
      align: "center" as const,
    },
    {
      id: "default-secondary",
      text: "{username}",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 640,
      fontSize: 35,
      color: "#FFFFFF",
      weight: "normal",
      align: "center" as const,
    },
  ],
  boost: [
    {
      id: "default-primary",
      text: "Thanks for the boost!",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 560,
      fontSize: 64,
      color: "#FFFFFF",
      weight: "bold",
      align: "center" as const,
    },
    {
      id: "default-secondary",
      text: "{username}",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 640,
      fontSize: 35,
      color: "#FFFFFF",
      weight: "normal",
      align: "center" as const,
    },
  ],
};

const DEFAULT_MESSAGE_BY_TYPE: Record<CanvasEventType, string> = {
  leave: "{user} left the server. We are now {membercount}.",
  ban: "{user} was banned from the server.",
  boost: "{user} boosted the server. Thank you!",
};

function assertEventType(raw: string): CanvasEventType {
  if (CANVAS_EVENT_TYPES.includes(raw as CanvasEventType)) {
    return raw as CanvasEventType;
  }
  throw new CanvasEventSettingsError(
    "Invalid eventType.",
    400,
    "INVALID_EVENT_TYPE",
  );
}

function assertSnowflake(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new CanvasEventSettingsError(
      `${field} must be a valid snowflake.`,
      400,
      "INVALID_IDS",
    );
  }
  return trimmed;
}

function storedBackgroundUrl(raw: string | null | undefined): string {
  const trimmed = raw?.trim() || "";
  return isWelcomeRemoteBackground(trimmed) ? trimmed : "";
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
  return clamp(amount, 0, 10, 4);
}

function normalizeHexColor(raw: string | undefined): string {
  const value = raw?.trim() || "#FFFFFF";
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  throw new CanvasEventSettingsError(
    "Color must be a #RRGGBB hex.",
    400,
    "INVALID_COLOR",
  );
}

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

function defaultLayers(eventType: CanvasEventType): WelcomeTextLayer[] {
  return DEFAULT_LAYERS_BY_TYPE[eventType].map((layer) => ({ ...layer }));
}

export async function getCanvasEventSettings(
  eventTypeRaw: string,
  guildIdRaw?: string,
): Promise<CanvasEventSettingsResponse> {
  const eventType = assertEventType(eventTypeRaw);
  const guildId = assertSnowflake(guildIdRaw?.trim() || "", "guildId");

  const row = await one(
    getDb()
      .select()
      .from(canvasEventSettings)
      .where(
        and(
          eq(canvasEventSettings.guildId, guildId),
          eq(canvasEventSettings.eventType, eventType),
        ),
      )
      .limit(1),
  );

  if (!row) {
    return {
      guildId,
      channelId: null,
      isEnabled: false,
      backgroundUrl: "",
      bgFilepath: null,
      blurAmount: 4,
      messageContent: DEFAULT_MESSAGE_BY_TYPE[eventType],
      avatarX: Math.round(WELCOME_CARD_WIDTH / 2),
      avatarY: 380,
      avatarSize: WELCOME_AVATAR_SIZE_MIN,
      avatarBorderWidth: 8,
      avatarBorderColor: "#FFFFFF",
      textLayers: defaultLayers(eventType),
    };
  }

  return {
    guildId: row.guildId,
    channelId: row.channelId,
    isEnabled: row.isEnabled,
    backgroundUrl: storedBackgroundUrl(row.backgroundUrl),
    bgFilepath: row.bgFilepath?.trim() || null,
    blurAmount: clampBlur(row.blurAmount),
    messageContent: row.messageContent || DEFAULT_MESSAGE_BY_TYPE[eventType],
    avatarX: clamp(row.avatarX, 0, WELCOME_CARD_WIDTH, WELCOME_CARD_WIDTH / 2),
    avatarY: clamp(row.avatarY, 0, WELCOME_CARD_HEIGHT, 380),
    avatarSize: clamp(
      row.avatarSize,
      WELCOME_AVATAR_SIZE_MIN,
      WELCOME_AVATAR_SIZE_MAX,
      WELCOME_AVATAR_SIZE_MIN,
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

/**
 * Persiste la config de un evento canvas. La validación del canal (existe, es
 * de este guild, admite texto) la hace el router antes de llamar aquí.
 */
export async function saveCanvasEventSettings(
  eventTypeRaw: string,
  input: SaveCanvasEventSettingsRequest,
): Promise<SaveCanvasEventSettingsResponse> {
  const eventType = assertEventType(eventTypeRaw);
  const guildId = assertSnowflake(input.guildId, "guildId");
  const channelIdRaw = input.channelId?.trim() || "";
  const channelId = channelIdRaw
    ? assertSnowflake(channelIdRaw, "channelId")
    : null;
  const isEnabled = Boolean(input.isEnabled);

  if (isEnabled && !channelId) {
    throw new CanvasEventSettingsError(
      "Select a destination channel to enable the module.",
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
  const avatarX = clamp(
    input.avatarX,
    0,
    WELCOME_CARD_WIDTH,
    WELCOME_CARD_WIDTH / 2,
  );
  const avatarY = clamp(input.avatarY, 0, WELCOME_CARD_HEIGHT, 380);
  const avatarSize = clamp(
    input.avatarSize,
    WELCOME_AVATAR_SIZE_MIN,
    WELCOME_AVATAR_SIZE_MAX,
    WELCOME_AVATAR_SIZE_MIN,
  );
  const avatarBorderWidth = clamp(input.avatarBorderWidth, 0, 40, 8);
  const avatarBorderColor = normalizeHexColor(input.avatarBorderColor);
  const textLayers = normalizeTextLayers(
    Array.isArray(input.textLayers) ? input.textLayers : [],
  );
  const resolvedLayers =
    textLayers.length > 0 ? textLayers : defaultLayers(eventType);

  const bgFilepath = input.bgFilepath?.trim() || null;
  if (bgFilepath && !resolvePublicUploadPath(bgFilepath)) {
    throw new CanvasEventSettingsError(
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
    primaryText: first?.text ?? DEFAULT_LAYERS_BY_TYPE[eventType][0]!.text,
    secondaryText: second?.text ?? "{username}",
    textX: first?.x ?? Math.round(WELCOME_CARD_WIDTH / 2),
    textY: first?.y ?? 560,
    fontSize: first?.fontSize ?? 64,
    textColor: first?.color ?? "#FFFFFF",
    updatedAt: now,
  };

  const existing = await one(
    db
      .select()
      .from(canvasEventSettings)
      .where(
        and(
          eq(canvasEventSettings.guildId, guildId),
          eq(canvasEventSettings.eventType, eventType),
        ),
      )
      .limit(1),
  );

  if (existing) {
    await db
      .update(canvasEventSettings)
      .set(payload)
      .where(
        and(
          eq(canvasEventSettings.guildId, guildId),
          eq(canvasEventSettings.eventType, eventType),
        ),
      );
  } else {
    await db.insert(canvasEventSettings).values({
      guildId,
      eventType,
      ...payload,
    });
  }

  return { ok: true };
}

export async function disableCanvasEventSettings(
  eventType: CanvasEventType,
  guildId: string,
): Promise<void> {
  await getDb()
    .update(canvasEventSettings)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(canvasEventSettings.guildId, guildId),
        eq(canvasEventSettings.eventType, eventType),
      ),
    );
}
