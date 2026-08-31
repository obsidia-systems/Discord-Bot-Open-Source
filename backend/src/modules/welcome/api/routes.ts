import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { saveWelcomeSettingsSchema } from "../../../core/http/schemas.js";
import { getWelcomeSettings, saveWelcomeSettings } from "../service.js";

export function welcomeSettingsRoutes(_bot: Client): Router {
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
      const result = await saveWelcomeSettings({
        ...payload,
        guildId: guildIdOf(req),
      });
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
