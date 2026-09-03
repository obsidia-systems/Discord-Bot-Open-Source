import fs from "node:fs";
import path from "node:path";
import type { WelcomeTextLayer } from "@adobos/shared";
import {
  isWelcomeRemoteBackground,
  WELCOME_AVATAR_SIZE_MAX,
  WELCOME_AVATAR_SIZE_MIN,
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
  WELCOME_FONT_SIZE_MAX,
  WELCOME_FONT_SIZE_MIN,
} from "@adobos/shared";
import {
  createCanvas,
  GlobalFonts,
  type Image,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { logger } from "#core/log.js";
import { resolvePublicUploadPath } from "#lib/dataPaths.js";

/** Lienzo fijo 1920×1080 (coincide con sliders del panel). */
export const CARD_WIDTH = WELCOME_CARD_WIDTH;
export const CARD_HEIGHT = WELCOME_CARD_HEIGHT;
export const AVATAR_SIZE_MIN = WELCOME_AVATAR_SIZE_MIN;
export const AVATAR_SIZE_MAX = WELCOME_AVATAR_SIZE_MAX;

const FONT_FAMILY = "Inter";

const __dirname = import.meta.dirname;

function resolveFontsDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../../../assets/fonts"),
    path.resolve(__dirname, "../../../assets/fonts"),
    path.resolve(process.cwd(), "assets/fonts"),
    path.resolve(process.cwd(), "backend/assets/fonts"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "Inter-Bold.ttf"))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

let fontsRegistered = false;

function ensureFontsRegistered(): void {
  if (fontsRegistered) return;

  const fontsDir = resolveFontsDir();
  const boldPath = path.join(fontsDir, "Inter-Bold.ttf");
  const regularPath = path.join(fontsDir, "Inter-Regular.ttf");

  if (!fs.existsSync(boldPath)) {
    logger.warn(`Font not found: . The card text may not render.`);
  } else {
    GlobalFonts.registerFromPath(boldPath, FONT_FAMILY);
  }

  if (fs.existsSync(regularPath)) {
    GlobalFonts.registerFromPath(regularPath, FONT_FAMILY);
  }

  fontsRegistered = true;
}

export interface WelcomeCardUser {
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface BuildWelcomeCardOptions {
  user: WelcomeCardUser;
  bgFilepath?: string | null;
  backgroundUrl?: string | null;
  blurAmount?: number;
  avatarX?: number;
  avatarY?: number;
  avatarSize?: number;
  avatarBorderWidth?: number;
  avatarBorderColor?: string;
  textLayers?: WelcomeTextLayer[];
  /** @deprecated Usar textLayers. */
  primaryText?: string;
  /** @deprecated Usar textLayers. */
  secondaryText?: string;
  /** @deprecated Usar textLayers. */
  textX?: number;
  /** @deprecated Usar textLayers. */
  textY?: number;
  /** @deprecated Usar textLayers. */
  fontSize?: number;
  /** @deprecated Usar textLayers. */
  textColor?: string;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AdobosBot/1.0 (+welcome-card)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Couldn't download image (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function loadRemoteImage(url: string): Promise<Image> {
  const buffer = await fetchImageBuffer(url);
  return loadImage(buffer);
}

async function loadLocalUpload(publicPath: string): Promise<Image> {
  const absolute = resolvePublicUploadPath(publicPath);
  if (!absolute) throw new Error("Invalid upload path");
  return loadImage(absolute);
}

function toInt(value: unknown, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampBlur(amount: number): number {
  return clamp(amount, 0, 10);
}

function normalizeHexColor(raw?: string): string {
  const value = (raw ?? "").trim() || "#ffffff";
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return "#ffffff";
}

function legacyLayersFromOptions(
  options: BuildWelcomeCardOptions,
): WelcomeTextLayer[] {
  const fontSize = clamp(
    toInt(options.fontSize, 64),
    WELCOME_FONT_SIZE_MIN,
    WELCOME_FONT_SIZE_MAX,
  );
  const textX = clamp(toInt(options.textX, CARD_WIDTH / 2), 0, CARD_WIDTH);
  const textY = clamp(toInt(options.textY, 560), 0, CARD_HEIGHT);
  const color = normalizeHexColor(options.textColor);
  const primary = (options.primaryText ?? "").trim() || "Welcome!";
  const secondary =
    (options.secondaryText ?? "").trim() || options.user.username;

  return [
    {
      id: "legacy-primary",
      text: primary,
      x: textX,
      y: textY,
      fontSize,
      color,
      weight: "bold",
      align: "left",
    },
    {
      id: "legacy-secondary",
      text: secondary,
      x: textX,
      y: textY + fontSize + 16,
      fontSize: Math.max(12, Math.round(fontSize * 0.55)),
      color,
      weight: "normal",
      align: "left",
    },
  ];
}

function resolveTextLayers(
  options: BuildWelcomeCardOptions,
): WelcomeTextLayer[] {
  if (Array.isArray(options.textLayers) && options.textLayers.length > 0) {
    return options.textLayers;
  }
  return legacyLayersFromOptions(options);
}

function drawBackgroundCover(ctx: SKRSContext2D, image: Image): void {
  ctx.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawFallbackBackground(ctx: SKRSContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#1c1917");
  gradient.addColorStop(0.45, "#7c2d12");
  gradient.addColorStop(1, "#C45C26");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawBlurredBackground(
  ctx: SKRSContext2D,
  image: Image,
  blurAmount: number,
): void {
  if (blurAmount <= 0) {
    drawBackgroundCover(ctx, image);
    return;
  }

  const scale = Math.max(0.18, 1 - blurAmount * 0.06);
  const smallW = Math.max(64, Math.round(CARD_WIDTH * scale));
  const smallH = Math.max(36, Math.round(CARD_HEIGHT * scale));
  const small = createCanvas(smallW, smallH);
  const smallCtx = small.getContext("2d");
  smallCtx.drawImage(image, 0, 0, smallW, smallH);

  const blurred = createCanvas(smallW, smallH);
  const blurredCtx = blurred.getContext("2d");
  blurredCtx.filter = `blur(${blurAmount}px)`;
  blurredCtx.drawImage(small, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(blurred, 0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawCircularAvatar(
  ctx: SKRSContext2D,
  avatar: Image | null,
  cx: number,
  cy: number,
  size: number,
  borderWidth: number,
  borderColor: string,
): void {
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - radius, cy - radius, size, size);
  } else {
    ctx.fillStyle = "#C45C26";
    ctx.fillRect(cx - radius, cy - radius, size, size);
  }
  ctx.restore();

  if (borderWidth > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
  }
}

function drawTextLayers(ctx: SKRSContext2D, layers: WelcomeTextLayer[]): void {
  for (const layer of layers) {
    const text = layer.text.trim();
    if (!text) continue;
    const fontSize = clamp(toInt(layer.fontSize, 64), 12, 200);
    const x = clamp(toInt(layer.x, 0), 0, CARD_WIDTH);
    const y = clamp(toInt(layer.y, 0), 0, CARD_HEIGHT);
    const color = normalizeHexColor(layer.color);
    const weight = layer.weight === "normal" ? "normal" : "bold";

    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = layer.align === "center" ? "center" : "left";
    ctx.textBaseline = "top";
    ctx.font = `${weight} ${fontSize}px ${FONT_FAMILY}`;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

async function resolveBackgroundImage(
  options: BuildWelcomeCardOptions,
): Promise<Image | null> {
  if (options.bgFilepath?.trim()) {
    try {
      return await loadLocalUpload(options.bgFilepath.trim());
    } catch {
      // fallback
    }
  }

  const url = options.backgroundUrl?.trim() ?? "";
  if (!isWelcomeRemoteBackground(url)) {
    return null;
  }
  try {
    return await loadRemoteImage(url);
  } catch {
    return null;
  }
}

/**
 * Genera una tarjeta PNG de bienvenida (1920×1080).
 * Capas de texto y borde de avatar 1:1 con el panel.
 */
export async function buildWelcomeCard(
  options: BuildWelcomeCardOptions,
): Promise<Buffer> {
  ensureFontsRegistered();

  const blurAmount = clampBlur(toInt(options.blurAmount, 4));
  const avatarX = clamp(toInt(options.avatarX, CARD_WIDTH / 2), 0, CARD_WIDTH);
  const avatarY = clamp(toInt(options.avatarY, 380), 0, CARD_HEIGHT);
  const avatarSize = clamp(
    toInt(options.avatarSize, AVATAR_SIZE_MIN),
    AVATAR_SIZE_MIN,
    AVATAR_SIZE_MAX,
  );
  const borderWidth = clamp(toInt(options.avatarBorderWidth, 8), 0, 40);
  const borderColor = normalizeHexColor(options.avatarBorderColor);
  const layers = resolveTextLayers(options);

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  const background = await resolveBackgroundImage(options);
  if (background) {
    drawBlurredBackground(ctx, background, blurAmount);
  } else {
    drawFallbackBackground(ctx);
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  overlay.addColorStop(0, "rgba(0,0,0,0.20)");
  overlay.addColorStop(0.55, "rgba(0,0,0,0.30)");
  overlay.addColorStop(1, "rgba(0,0,0,0.50)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  let avatarImage: Image | null = null;
  try {
    avatarImage = await loadRemoteImage(options.user.avatarUrl);
  } catch {
    avatarImage = null;
  }
  drawCircularAvatar(
    ctx,
    avatarImage,
    avatarX,
    avatarY,
    avatarSize,
    borderWidth,
    borderColor,
  );

  drawTextLayers(ctx, layers);

  return canvas.toBuffer("image/png");
}

export const WELCOME_CARD_DEFAULT_BACKGROUND = "";
