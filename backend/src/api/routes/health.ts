import type { HealthResponse, ReadyResponse } from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { roleRunsGateway } from "#core/runtime/index.js";
import { pingDatabase } from "#db/client.js";

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

  router.get("/ready", async (_req, res) => {
    const postgres = await pingDatabase();
    const checkDiscord = roleRunsGateway();
    const discord = checkDiscord ? bot.isReady() : "skipped";
    const ok = postgres && (discord === "skipped" || discord === true);
    const body: ReadyResponse = {
      status: ok ? "ok" : "degraded",
      postgres,
      discord,
      timestamp: new Date().toISOString(),
    };
    res.status(ok ? 200 : 503).json(body);
  });

  return router;
}
