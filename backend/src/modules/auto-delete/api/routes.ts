import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getAutoDeleteConfig, updateAutoDeleteConfig } from "../service.js";
import { updateAutoDeleteConfigSchema } from "./schema.js";

export function autoDeleteRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/auto-delete/config */
  router.get(
    "/config",
    defineRoute({}, async (req, res) => {
      const config = await getAutoDeleteConfig(guildIdOf(req));
      res.json({ config, timezone: config.timezone });
    }),
  );

  /** POST /api/auto-delete/config */
  router.post(
    "/config",
    defineRoute(
      { body: updateAutoDeleteConfigSchema },
      async (req, res, valid) => {
        const config = await updateAutoDeleteConfig(valid.body, guildIdOf(req));
        res.json({ config, timezone: config.timezone });
      },
    ),
  );

  return router;
}
