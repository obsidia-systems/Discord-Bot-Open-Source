import { Router } from "express";
import type { Client } from "discord.js";
import type { HealthResponse } from "@adobos/shared";

export function healthRouter(bot: Client): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const body: HealthResponse = {
      status: "ok",
      uptime: process.uptime(),
      botReady: bot.isReady(),
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  return router;
}
