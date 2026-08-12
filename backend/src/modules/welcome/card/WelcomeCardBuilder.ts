import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { resolvePublicUploadPath } from "../../../lib/dataPaths.js";

/** Lienzo fijo 1920×1080 (coincide con sliders del panel). */
export const CARD_WIDTH = 1920;
export const CARD_HEIGHT = 1080;
/** Tamaño mínimo del avatar (diámetro en px). */
export const AVATAR_SIZE_MIN = 280;
/** Tamaño máximo del avatar (diámetro en px). */
export const AVATAR_SIZE_MAX = 720;

const FONT_FAMILY = "Inter";
const DEFAULT_BG =
  "https://images.unsplash.com/photo-1614850715649-1d0106293bd1?auto=format&fit=crop&w=1920&q=80";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** `backend/assets/fonts` — funciona en tsx (src/) y en dist/ compilado. */
function resolveFontsDir(): string {
  const candidates = [
    // src/modules/welcome/card o dist/... → backend/assets/fonts
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
    console.warn(
      `[adobos] Fuente no encontrada: ${boldPath}. El texto de la tarjeta puede no renderizar.`,
    );
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
  /** Ruta pública `/uploads/backgrounds/...` */
  bgFilepath?: string | null;
  /** URL remota de respaldo (galería). */
  backgroundUrl?: string | null;
  blurAmount?: number;
  primaryText: string;
  secondaryText?: string;
  avatarX?: number;
  avatarY?: number;
  /** Diámetro del avatar; mínimo = AVATAR_SIZE_MIN. */
  avatarSize?: number;
  textX?: number;
  textY?: number;
  /** Tamaño exacto del texto principal en px. */
  fontSize?: number;
  textColor?: string;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AdobosBot/1.0 (+welcome-card)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar imagen (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function loadRemoteImage(url: string): Promise<Image> {
  const buffer = await fetchImageBuffer(url);
  return loadImage(buffer);
}

async function loadLocalUpload(publicPath: string): Promise<Image> {
  const absolute = resolvePublicUploadPath(publicPath);
  if (!absolute) throw new Error("Ruta de upload inválida");
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

/** Estira el fondo exactamente a 1920×1080. */
function drawBackgroundCover(
  ctx: SKRSContext2D,
  image: Image,
): void {
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

  // Desenfoque vía downscale + filter, siempre volviendo al lienzo 1920×1080
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
  avatar: Image,
  cx: number,
  cy: number,
  size: number,
): void {
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, cx - radius, cy - radius, size, size);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 8;
  ctx.stroke();
}

async function resolveBackgroundImage(
  options: BuildWelcomeCardOptions,
): Promise<Image | null> {
  if (options.bgFilepath?.trim()) {
    try {
      return await loadLocalUpload(options.bgFilepath.trim());
    } catch {
      // fallback a URL
    }
  }

  const url = options.backgroundUrl?.trim() || DEFAULT_BG;
  try {
    return await loadRemoteImage(url);
  } catch {
    return null;
  }
}

/**
 * Genera una tarjeta PNG de bienvenida (lienzo fijo 1920×1080 + Inter).
 * Coordenadas y fontSize son 1:1 con la vista previa del panel.
 */
export async function buildWelcomeCard(
  options: BuildWelcomeCardOptions,
): Promise<Buffer> {
  ensureFontsRegistered();

  const blurAmount = clampBlur(toInt(options.blurAmount, 4));
  const primary = (options.primaryText ?? "").trim() || "¡Bienvenido!";
  const secondary =
    (options.secondaryText ?? "").trim() || options.user.username;
  const textColor = normalizeHexColor(options.textColor);

  const avatarX = clamp(toInt(options.avatarX, CARD_WIDTH / 2), 0, CARD_WIDTH);
  const avatarY = clamp(toInt(options.avatarY, 380), 0, CARD_HEIGHT);
  const avatarSize = clamp(
    toInt(options.avatarSize, AVATAR_SIZE_MIN),
    AVATAR_SIZE_MIN,
    AVATAR_SIZE_MAX,
  );
  const textX = clamp(toInt(options.textX, CARD_WIDTH / 2), 0, CARD_WIDTH);
  const textY = clamp(toInt(options.textY, 560), 0, CARD_HEIGHT);
  const fontSize = clamp(toInt(options.fontSize, 64), 20, 200);
  const secondarySize = Math.max(12, Math.round(fontSize * 0.55));

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

  // Avatar: (avatarX, avatarY) = centro del círculo (igual que left/top CSS con offset -size/2)
  try {
    const avatar = await loadRemoteImage(options.user.avatarUrl);
    drawCircularAvatar(ctx, avatar, avatarX, avatarY, avatarSize);
  } catch {
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#C45C26";
    ctx.fill();
  }

  // Texto: left/top exactos (sin márgenes extra)
  ctx.save();
  ctx.fillStyle = textColor || "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
  ctx.fillText(primary, textX, textY);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = textColor || "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `normal ${secondarySize}px ${FONT_FAMILY}`;
  ctx.fillText(secondary, textX, textY + fontSize + 16);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

export const WELCOME_CARD_DEFAULT_BACKGROUND = DEFAULT_BG;
