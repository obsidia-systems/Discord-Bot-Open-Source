import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { updateAutoModConfigSchema } from "./schema.js";
import {
  getAutoModConfig,
  updateAutoModConfig,
} from "../service.js";
import { syncNativeAutoMod } from "../nativeSync.js";

export function autoModRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/auto-mod/config */
  router.get("/config", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const config = await getAutoModConfig(guildId);
      res.json({ config });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/auto-mod/config */
  router.post("/config", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateAutoModConfigSchema, req.body ?? {});
      const config = await updateAutoModConfig(body, guildId);
      const nativeSync = await syncNativeAutoMod(bot, guildId, config);
      res.json({ config, nativeSync });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
