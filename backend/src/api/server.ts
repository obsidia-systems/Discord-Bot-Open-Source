import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import type { Client } from "discord.js";
import { healthRouter } from "./routes/health.js";
import { messageRoutes } from "./routes/message.routes.js";

export interface CreateAppOptions {
  bot: Client;
  staticDir: string;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", healthRouter(options.bot));
  app.use("/api/messages", messageRoutes(options.bot));

  // SPA / estáticos del panel Astro (inyectados en Docker como ./public)
  app.use(express.static(options.staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(options.staticDir, "index.html"), (err) => {
      if (err) next();
    });
  });

  return app;
}
