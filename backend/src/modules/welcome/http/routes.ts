import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getWelcomeSettings, saveWelcomeSettings } from "../domain/welcome.js";
import { saveWelcomeSettingsSchema } from "./schema.js";

export function welcomeSettingsRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getWelcomeSettings(guildIdOf(req)));
    }),
  );

  router.post(
    "/",
    defineRoute(
      { body: saveWelcomeSettingsSchema },
      async (req, res, valid) => {
        const result = await saveWelcomeSettings(
          { ...valid.body, guildId: guildIdOf(req) },
          bot,
        );
        res.json(result);
      },
    ),
  );

  return router;
}
