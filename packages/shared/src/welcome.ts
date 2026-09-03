import { isHttpUrl } from "./messages.js";

export const WELCOME_CARD_WIDTH = 1920;
export const WELCOME_CARD_HEIGHT = 1080;
export const WELCOME_AVATAR_SIZE_MIN = 280;
export const WELCOME_AVATAR_SIZE_MAX = 720;
export const WELCOME_FONT_SIZE_MIN = 20;
export const WELCOME_FONT_SIZE_MAX = 200;
export const WELCOME_TEXT_LAYERS_MAX = 12;

/** GuildText (0) y GuildAnnouncement (5). */
export const WELCOME_SEND_CHANNEL_TYPES = [0, 5] as const;

export type WelcomeTextWeight = "normal" | "bold";
export type WelcomeTextAlign = "left" | "center";
export type WelcomeVariableSurface = "message" | "card";

/** Capa de texto del canvas de bienvenida. */
export interface WelcomeTextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  weight: WelcomeTextWeight;
  /** Default `left` para filas viejas. Las capas nuevas usan `center`. */
  align?: WelcomeTextAlign;
}

export interface WelcomeTemplateContext {
  userMention: string;
  username: string;
  displayName: string;
  serverName: string;
  memberCount: number;
}

export interface WelcomeSettingsResponse {
  guildId: string;
  channelId: string | null;
  isEnabled: boolean;
  backgroundUrl: string;
  bgFilepath: string | null;
  blurAmount: number;
  messageContent: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  textLayers: WelcomeTextLayer[];
}

export interface SaveWelcomeSettingsRequest {
  guildId: string;
  channelId?: string | null;
  isEnabled: boolean;
  backgroundUrl?: string;
  bgFilepath?: string | null;
  blurAmount: number;
  messageContent?: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  textLayers: WelcomeTextLayer[];
}

export interface SaveWelcomeSettingsResponse {
  ok: true;
}

/** URL Unsplash que se usaba de default; ya no se descarga. */
export const WELCOME_LEGACY_UNSPLASH_BACKGROUND =
  "https://images.unsplash.com/photo-1614850715649-1d0106293bd1?auto=format&fit=crop&w=1920&q=80";

export const WELCOME_CARD_FALLBACK_GRADIENT =
  "linear-gradient(135deg, #1c1917 0%, #7c2d12 45%, #C45C26 100%)";

export function isWelcomeSendChannelType(type: number): boolean {
  return (WELCOME_SEND_CHANNEL_TYPES as readonly number[]).includes(type);
}

/** Fondo http(s) real. Vacío y el Unsplash legacy cuentan como default local. */
export function isWelcomeRemoteBackground(
  url: string | null | undefined,
): boolean {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return false;
  if (
    trimmed.startsWith(
      "https://images.unsplash.com/photo-1614850715649-1d0106293bd1",
    )
  ) {
    return false;
  }
  return isHttpUrl(trimmed);
}

export function applyWelcomeVariables(
  text: string,
  ctx: WelcomeTemplateContext,
  surface: WelcomeVariableSurface = "message",
): string {
  const userToken =
    surface === "card" ? ctx.displayName || ctx.username : ctx.userMention;
  return text
    .replaceAll("{user}", userToken)
    .replaceAll("{username}", ctx.username)
    .replaceAll("{displayname}", ctx.displayName)
    .replaceAll("{displayName}", ctx.displayName)
    .replaceAll("{server}", ctx.serverName)
    .replaceAll("{membercount}", String(ctx.memberCount))
    .replaceAll("{memberCount}", String(ctx.memberCount));
}

/** Leave no se publica si el miembro acaba de ser baneado. */
export function shouldDispatchLeave(userIsBanned: boolean): boolean {
  return !userIsBanned;
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

function normalizeHexColor(raw: string | undefined): string {
  const value = raw?.trim() || "#FFFFFF";
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return "#FFFFFF";
}

export function normalizeTextLayers(raw: unknown[]): WelcomeTextLayer[] {
  const layers: WelcomeTextLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (layers.length >= WELCOME_TEXT_LAYERS_MAX) break;
    const row = item as Record<string, unknown>;
    const text =
      typeof row.text === "string" ? row.text.trim().slice(0, 200) : "";
    if (!text) continue;
    layers.push({
      id:
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim().slice(0, 64)
          : `layer-${layers.length + 1}`,
      text,
      x: clamp(Number(row.x), 0, WELCOME_CARD_WIDTH, WELCOME_CARD_WIDTH / 2),
      y: clamp(Number(row.y), 0, WELCOME_CARD_HEIGHT, 560),
      fontSize: clamp(
        Number(row.fontSize),
        WELCOME_FONT_SIZE_MIN,
        WELCOME_FONT_SIZE_MAX,
        64,
      ),
      color: normalizeHexColor(
        typeof row.color === "string" ? row.color : "#FFFFFF",
      ),
      weight: row.weight === "normal" ? "normal" : "bold",
      align: row.align === "center" ? "center" : "left",
    });
  }
  return layers;
}

export function defaultWelcomeTextLayers(): WelcomeTextLayer[] {
  return [
    {
      id: "default-primary",
      text: "Welcome to {server}!",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 560,
      fontSize: 64,
      color: "#FFFFFF",
      weight: "bold",
      align: "center",
    },
    {
      id: "default-secondary",
      text: "{username}",
      x: Math.round(WELCOME_CARD_WIDTH / 2),
      y: 640,
      fontSize: 35,
      color: "#FFFFFF",
      weight: "normal",
      align: "center",
    },
  ];
}

export function newWelcomeTextLayer(
  over: Partial<WelcomeTextLayer> = {},
): WelcomeTextLayer {
  return {
    id: over.id ?? `layer-${Date.now().toString(36)}`,
    text: over.text ?? "Nuevo texto",
    x: over.x ?? Math.round(WELCOME_CARD_WIDTH / 2),
    y: over.y ?? 720,
    fontSize: over.fontSize ?? 48,
    color: over.color ?? "#FFFFFF",
    weight: over.weight ?? "bold",
    align: over.align ?? "center",
  };
}
