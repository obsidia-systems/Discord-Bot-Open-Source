import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { saveCanvasEventSettingsSchema } from "./schema.js";
import type { CanvasEventType } from "@adobos/shared";
import {
  getCanvasEventSettings,
  saveCanvasEventSettings,
} from "../service.js";

export function canvasEventSettingsRoutes(
  eventType: CanvasEventType,
  _bot: Client,
): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    const guildId =
      guildIdOf(req);

    try {
      res.json(await getCanvasEventSettings(eventType, guildId));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const payload = parse(saveCanvasEventSettingsSchema, req.body);
      const result = await saveCanvasEventSettings(eventType, {
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
