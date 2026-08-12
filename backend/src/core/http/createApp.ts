import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import type { Client } from "discord.js";
import type { ModuleRegistry } from "../modules/registry.js";
import { healthRouter } from "../../api/routes/health.js";
import { uploadRoutes } from "../../api/routes/uploads.routes.js";
import { getUploadsRoot } from "../../lib/dataPaths.js";

export interface CreateAppOptions {
  bot: Client;
  registry: ModuleRegistry;
  staticDir: string;
}

/**
 * Express kernel: health + uploads + rutas aportadas por módulos + estáticos.
 */
export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
  app.use(express.json({ limit: "1mb" }));

  // Infraestructura del core (no son features de dominio)
  app.use("/api/health", healthRouter(options.bot));
  app.use("/api/uploads", uploadRoutes());

  for (const entry of options.registry.routes) {
    app.use(entry.basePath, entry.router);
  }

  app.use("/uploads", express.static(getUploadsRoot()));

  app.use(express.static(options.staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    res.sendFile(path.join(options.staticDir, "index.html"), (err) => {
      if (err) next();
    });
  });

  return app;
}
