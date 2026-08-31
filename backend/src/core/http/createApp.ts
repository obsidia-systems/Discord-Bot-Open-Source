import path from "node:path";
import express, { type Express, type Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Client } from "discord.js";
import type { ModuleRegistry } from "../modules/registry.js";
import { healthRouter } from "../../api/routes/health.js";
import { uploadRoutes } from "../../api/routes/uploads.routes.js";
import { getUploadsRoot } from "../../lib/dataPaths.js";
import { authRouter, meRouter } from "../auth/oauth.js";
import { requireAuth, requireGuildAccess } from "./guildContext.js";

export interface CreateAppOptions {
  bot: Client;
  registry: ModuleRegistry;
  staticDir: string;
}

function assertPanelEnv(): void {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET debe definirse (mínimo 16 caracteres) para las sesiones del panel.",
    );
  }
  if (!process.env.PUBLIC_APP_URL?.trim()) {
    throw new Error("PUBLIC_APP_URL es obligatorio (redirect OAuth y CORS).");
  }
  if (!process.env.DISCORD_CLIENT_ID?.trim()) {
    throw new Error("DISCORD_CLIENT_ID es obligatorio para OAuth del panel.");
  }
  if (!process.env.DISCORD_CLIENT_SECRET?.trim()) {
    throw new Error("DISCORD_CLIENT_SECRET es obligatorio para OAuth del panel.");
  }
}

function corsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) {
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 1) return list[0]!;
    if (list.length > 1) return list;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CORS_ORIGIN es obligatorio en producción (allowlist, no origin:true).",
    );
  }
  return process.env.PUBLIC_APP_URL?.trim() || "http://localhost:4321";
}

function isPublicApiPath(req: Request): boolean {
  return req.path === "/health" || req.path.startsWith("/health/");
}

/**
 * Express kernel: health + auth + uploads + rutas de módulos + estáticos.
 * /api/* (salvo health) exige sesión. Rutas de dominio exigen guild.
 */
export function createApp(options: CreateAppOptions): Express {
  assertPanelEnv();
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin(), credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.use("/auth", authRouter());
  app.use("/api/health", healthRouter(options.bot));

  app.use("/api", (req, res, next) => {
    if (isPublicApiPath(req)) return next();
    return requireAuth()(req, res, next);
  });
  app.use("/api/me", meRouter());
  app.use("/api/uploads", requireGuildAccess(), uploadRoutes());

  for (const entry of options.registry.routes) {
    app.use(entry.basePath, requireGuildAccess(), entry.router);
  }

  app.use("/uploads", requireAuth(), express.static(getUploadsRoot()));

  app.use((req, res, next) => {
    if (!req.path.startsWith("/dashboard")) return next();
    return requireAuth()(req, res, next);
  });

  app.use(express.static(options.staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/auth")) {
      return next();
    }
    res.sendFile(path.join(options.staticDir, "index.html"), (err) => {
      if (err) next();
    });
  });

  return app;
}
