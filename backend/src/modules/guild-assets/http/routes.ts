import { Router } from "express";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getGuildAssets } from "./controller.js";

export function guildAssetsRoutes(gateway: BotGateway): Router {
  const router = Router();

  /** GET /api/guild-assets — tenant de sesión. */
  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getGuildAssets(gateway, guildIdOf(req)));
    }),
  );

  return router;
}
