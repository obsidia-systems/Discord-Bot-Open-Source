import { Router } from "express";
import type { Client } from "discord.js";
import { resolveSchedulerTimezone } from "../../../lib/schedulerTimezone.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { updateAutoDeleteConfigSchema } from "../../../core/http/schemas.js";
import {
  getAutoDeleteConfig,
  updateAutoDeleteConfig,
} from "../service.js";

export function autoDeleteRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/auto-delete/config */
  router.get("/config", async (req, res, next) => {
    try {
      const guildId =
        guildIdOf(req);
      const config = await getAutoDeleteConfig(guildId);
      res.json({ config, timezone: resolveSchedulerTimezone() });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/auto-delete/config */
  router.post("/config", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateAutoDeleteConfigSchema, req.body ?? {});
      const config = await updateAutoDeleteConfig(body, guildId);
      res.json({ config, timezone: resolveSchedulerTimezone() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
