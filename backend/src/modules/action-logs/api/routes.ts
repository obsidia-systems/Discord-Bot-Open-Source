import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { sendIfEntitlementError } from "../../../core/entitlements/service.js";
import { parse, parseQuery, sendIfValidationError } from "../../../core/http/validate.js";
import {
  actionLogsHistoryQuerySchema,
  updateActionLogsConfigSchema,
} from "../../../core/http/schemas.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  ActionLogsError,
  getActionLogsConfig,
  listActionLogsHistory,
  sendActionLogsTestEmbed,
  updateActionLogsConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
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
      const guildId = guildIdOf(req);
      const body = parse(updateActionLogsConfigSchema, req.body ?? {});
      const config = await updateActionLogsConfig(body, guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/logs/history */
  router.get("/history", async (req, res) => {
    try {
      const guildId = guildIdOf(req);
      const query = parseQuery(actionLogsHistoryQuerySchema, req.query);

      const result = await listActionLogsHistory({
        guildId,
        category: query.category as never,
        q: query.q,
        from: query.from,
        to: query.to,
        page: query.page,
        limit: query.limit,
      });
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/logs/test */
  router.post("/test", async (req, res) => {
    try {
      const result = await sendActionLogsTestEmbed(bot, guildIdOf(req));
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
