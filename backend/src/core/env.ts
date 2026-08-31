import { z } from "zod";
import { type AdobosRole, isAdobosRole } from "./runtime/index.js";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL debe ser postgresql://…",
    ),
  SESSION_SECRET: z.string().min(16),
  PUBLIC_APP_URL: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_TOKEN: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  ADOBO_ROLE: z.string().default("all"),
  SERVE_STATIC: z.string().optional(),
  STATIC_DIR: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  LOG_PRETTY: z.string().optional(),
  SHARD_COUNT: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
});

export interface AppEnv {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  HOST: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  PUBLIC_APP_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_TOKEN?: string;
  CORS_ORIGIN?: string;
  ADOBO_ROLE: AdobosRole;
  SERVE_STATIC: boolean;
  STATIC_DIR?: string;
  LOG_LEVEL?: string;
  LOG_PRETTY?: string;
  SHARD_COUNT?: string;
}

let cached: AppEnv | null = null;

function parseServeStatic(raw: string | undefined): boolean {
  if (raw === "false" || raw === "0") return false;
  return true;
}

/** Valida process.env al boot. Lanza si falta un secreto del panel. */
export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Env inválido: ${detail}`);
  }
  const raw = parsed.data;
  if (!isAdobosRole(raw.ADOBO_ROLE)) {
    throw new Error(
      `ADOBO_ROLE inválido (${raw.ADOBO_ROLE}). Usa all | api | gateway | worker.`,
    );
  }
  if (raw.NODE_ENV === "production" && !raw.CORS_ORIGIN?.trim()) {
    throw new Error(
      "CORS_ORIGIN es obligatorio en producción (allowlist, no origin:true).",
    );
  }
  const token = raw.DISCORD_TOKEN?.trim();
  if (token && raw.DISCORD_CLIENT_SECRET === token) {
    throw new Error(
      "DISCORD_CLIENT_SECRET no puede ser el token del bot. Usa OAuth2 → Client Secret.",
    );
  }
  cached = {
    NODE_ENV: raw.NODE_ENV,
    PORT: raw.PORT,
    HOST: raw.HOST,
    DATABASE_URL: raw.DATABASE_URL,
    SESSION_SECRET: raw.SESSION_SECRET,
    PUBLIC_APP_URL: raw.PUBLIC_APP_URL.replace(/\/$/, ""),
    DISCORD_CLIENT_ID: raw.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: raw.DISCORD_CLIENT_SECRET,
    DISCORD_TOKEN: token || undefined,
    CORS_ORIGIN: raw.CORS_ORIGIN,
    ADOBO_ROLE: raw.ADOBO_ROLE,
    SERVE_STATIC: parseServeStatic(raw.SERVE_STATIC),
    STATIC_DIR: raw.STATIC_DIR,
    LOG_LEVEL: raw.LOG_LEVEL,
    LOG_PRETTY: raw.LOG_PRETTY,
    SHARD_COUNT: raw.SHARD_COUNT,
  };
  return cached;
}

export function env(): AppEnv {
  return cached ?? loadEnv();
}
