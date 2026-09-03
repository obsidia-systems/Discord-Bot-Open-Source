import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getGuildAssets } from "./controller.js";

export function guildAssetsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/guild-assets — tenant de sesión. */
  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getGuildAssets(bot, guildIdOf(req)));
    }),
  );

  return router;
}
