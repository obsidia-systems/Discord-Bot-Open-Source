import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { getGuildAssets } from "./controller.js";

export function guildAssetsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/guild-assets?guildId=optional */
  router.get("/", async (req, res, next) => {
    try {
      res.json(await getGuildAssets(bot, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
