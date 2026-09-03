import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { syncNativeAutoMod } from "../nativeSync.js";
import { getAutoModConfig, updateAutoModConfig } from "../service.js";
import { updateAutoModConfigSchema } from "./schema.js";

export function autoModRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/auto-mod/config */
  router.get(
    "/config",
    defineRoute({}, async (req, res) => {
      const config = await getAutoModConfig(guildIdOf(req));
      res.json({ config });
    }),
  );

  /** POST /api/auto-mod/config */
  router.post(
    "/config",
    defineRoute(
      { body: updateAutoModConfigSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        const config = await updateAutoModConfig(valid.body, guildId);
        const nativeSync = await syncNativeAutoMod(bot, guildId, config);
        res.json({ config, nativeSync });
      },
    ),
  );

  return router;
}
