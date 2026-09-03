import type { CanvasEventType } from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { getCanvasEventSettings, saveCanvasEventSettings } from "../service.js";
import { saveCanvasEventSettingsSchema } from "./schema.js";

export function canvasEventSettingsRoutes(
  eventType: CanvasEventType,
  bot: Client,
): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await getCanvasEventSettings(eventType, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const payload = parse(saveCanvasEventSettingsSchema, req.body);
      const result = await saveCanvasEventSettings(
        eventType,
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
