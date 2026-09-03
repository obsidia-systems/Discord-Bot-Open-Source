import type { CanvasEventType } from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getCanvasEventSettings, saveCanvasEventSettings } from "../service.js";
import { saveCanvasEventSettingsSchema } from "./schema.js";

export function canvasEventSettingsRoutes(
  eventType: CanvasEventType,
  bot: Client,
): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getCanvasEventSettings(eventType, guildIdOf(req)));
    }),
  );

  router.post(
    "/",
    defineRoute(
      { body: saveCanvasEventSettingsSchema },
      async (req, res, valid) => {
        const result = await saveCanvasEventSettings(
          eventType,
          { ...valid.body, guildId: guildIdOf(req) },
          bot,
        );
        res.json(result);
      },
    ),
  );

  return router;
}
