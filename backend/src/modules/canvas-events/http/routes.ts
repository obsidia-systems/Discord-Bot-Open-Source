import type { CanvasEventType } from "@adobos/shared";
import { Router } from "express";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { assertGuildWelcomeChannel } from "#modules/welcome/channel.js";
import {
  getCanvasEventSettings,
  saveCanvasEventSettings,
} from "../domain/canvas-events.js";
import { saveCanvasEventSettingsSchema } from "./schema.js";

export function canvasEventSettingsRoutes(
  eventType: CanvasEventType,
  gateway: BotGateway,
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
        const guildId = guildIdOf(req);
        const channelId = valid.body.channelId?.trim();
        if (channelId) {
          await assertGuildWelcomeChannel(gateway, guildId, channelId);
        }
        const result = await saveCanvasEventSettings(eventType, {
          ...valid.body,
          guildId,
        });
        res.json(result);
      },
    ),
  );

  return router;
}
