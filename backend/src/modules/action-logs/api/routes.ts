import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { sendIfEntitlementError } from "../../../core/entitlements/service.js";
import type {
  ApiErrorBody,
  UpdateActionLogsConfigRequest,
} from "@adobos/shared";
import {
  ActionLogsError,
  getActionLogsConfig,
  listActionLogsHistory,
  sendActionLogsTestEmbed,
  updateActionLogsConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfEntitlementError(error, res)) return;
  if (error instanceof ActionLogsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/logs:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Action Logs.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function actionLogsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/logs/config */
  router.get("/config", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const config = await getActionLogsConfig(guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/logs/config */
  router.post("/config", async (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const body = (req.body ?? {}) as UpdateActionLogsConfigRequest;
      const config = await updateActionLogsConfig(body, guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/logs/history */
  router.get("/history", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const category =
        typeof req.query.category === "string" ? req.query.category : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const page =
        typeof req.query.page === "string"
          ? Number.parseInt(req.query.page, 10)
          : undefined;
      const limit =
        typeof req.query.limit === "string"
          ? Number.parseInt(req.query.limit, 10)
          : undefined;

      const result = await listActionLogsHistory({
        guildId,
        category: category as never,
        q,
        from,
        to,
        page,
        limit,
      });
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/logs/test */
  router.post("/test", async (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const result = await sendActionLogsTestEmbed(bot, guildId);
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
