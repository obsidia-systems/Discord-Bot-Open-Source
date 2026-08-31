import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Client } from "discord.js";
import express, {
  type Express,
  type Request,
  type RequestHandler,
} from "express";
import helmet from "helmet";
import { healthRouter } from "../../api/routes/health.js";
import { uploadRoutes } from "../../api/routes/uploads.routes.js";
import { getUploadsRoot } from "../../lib/dataPaths.js";
import { authRouter, meRouter } from "../auth/oauth.js";
import { entitlementsRoutes, requireFeature } from "../entitlements/index.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import type { ModuleRegistry } from "../modules/registry.js";
import { errorHandler, notFoundHandler } from "./errorHandler.js";
import { requireAuth, requireGuildAccess } from "./guildContext.js";
import {
  apiRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
} from "./rateLimit.js";
import { requestIdMiddleware } from "./requestContext.js";

export interface CreateAppOptions {
  bot: Client;
  registry: ModuleRegistry;
  staticDir: string;
}

function corsOrigin(): string | string[] {
  const raw = env().CORS_ORIGIN?.trim();
  if (raw) {
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 1) return list[0]!;
    if (list.length > 1) return list;
  }
  return env().PUBLIC_APP_URL.replace(/\/$/, "") || "http://localhost:4321";
}

function isPublicApiPath(req: Request, registry: ModuleRegistry): boolean {
  if (req.path === "/health" || req.path.startsWith("/health/")) return true;
  const full = `/api${req.path}`;
  return registry.rawRoutes.some((r) => r.path === full || r.path === req.path);
}

/**
 * Express kernel: health + auth + uploads + rutas de módulos.
 * /api/* (salvo health y webhooks raw) exige sesión. Rutas de dominio exigen guild.
 */
export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const { registry } = options;

  app.set("trust proxy", 1);
  app.use(requestIdMiddleware());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin(), credentials: true }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    if (req.path === "/api/health" || req.path.startsWith("/api/health/")) {
      next();
      return;
    }
    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - start,
          guildId: req.guild?.guildId,
        },
        "http",
      );
    });
    next();
  });

  for (const raw of registry.rawRoutes) {
    app[raw.method](
      raw.path,
      express.raw({ type: "application/json" }),
      raw.handler,
    );
  }
  app.use(express.json({ limit: "1mb" }));

  app.use("/auth", authRateLimiter, authRouter());
  app.use("/api/health", healthRouter(options.bot));

  app.use("/api", apiRateLimiter, (req, res, next) => {
    if (isPublicApiPath(req, registry)) return next();
    return requireAuth()(req, res, next);
  });
  app.use("/api/me", meRouter());
  app.use("/api/entitlements", requireGuildAccess(), entitlementsRoutes());
  app.use(
    "/api/uploads",
    uploadRateLimiter,
    requireGuildAccess(),
    uploadRoutes(),
  );

  for (const entry of registry.routes) {
    const guards: RequestHandler[] = [requireGuildAccess()];
    if (entry.feature) guards.push(requireFeature(entry.feature));
    app.use(entry.basePath, ...guards, entry.router);
  }

  app.use("/uploads", requireAuth(), express.static(getUploadsRoot()));

  const serveStatic = env().SERVE_STATIC;
  if (serveStatic) {
    app.use((req, res, next) => {
      if (!req.path.startsWith("/dashboard")) return next();
      return requireAuth()(req, res, next);
    });

    app.use(express.static(options.staticDir));
    app.get("*", (req, res, next) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/uploads") ||
        req.path.startsWith("/auth")
      ) {
        return next();
      }
      res.sendFile(path.join(options.staticDir, "index.html"), (err) => {
        if (err) next();
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** App mínima para gateway/worker: solo probes. */
export function createHealthApp(bot: Client): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(requestIdMiddleware());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use("/api/health", healthRouter(bot));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
