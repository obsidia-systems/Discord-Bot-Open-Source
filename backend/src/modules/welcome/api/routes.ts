import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { getWelcomeSettings, saveWelcomeSettings } from "../service.js";
import { saveWelcomeSettingsSchema } from "./schema.js";

export function welcomeSettingsRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await getWelcomeSettings(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const payload = parse(saveWelcomeSettingsSchema, req.body);
      const result = await saveWelcomeSettings(
        {
          ...payload,
          guildId: guildIdOf(req),
        },
        bot,
      );
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
