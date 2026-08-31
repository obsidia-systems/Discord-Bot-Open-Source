import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, parseQuery } from "../../../core/http/validate.js";
import {
  actionLogsHistoryQuerySchema,
  updateActionLogsConfigSchema,
} from "./schema.js";
import {
  getActionLogsConfig,
  listActionLogsHistory,
  sendActionLogsTestEmbed,
  updateActionLogsConfig,
} from "../service.js";

export function actionLogsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/logs/config */
  router.get("/config", async (req, res, next) => {
    try {
      const guildId =
        guildIdOf(req);
      const config = await getActionLogsConfig(guildId);
      res.json({ config });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/logs/config */
  router.post("/config", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateActionLogsConfigSchema, req.body ?? {});
      const config = await updateActionLogsConfig(body, guildId);
      res.json({ config });
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/logs/history */
  router.get("/history", async (req, res, next) => {
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
      next(error);
    }
  });

  /** POST /api/logs/test */
  router.post("/test", async (req, res, next) => {
    try {
      const result = await sendActionLogsTestEmbed(bot, guildIdOf(req));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
