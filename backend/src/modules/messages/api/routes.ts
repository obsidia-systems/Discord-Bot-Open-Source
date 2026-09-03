import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { sendAndRegisterEmbed } from "../library.js";
import { sendTextMessage } from "./controller.js";
import { sendEmbedSchema, sendMessageSchema } from "./schema.js";
import { optionalEmbedUpload, uploadedFromRequest } from "./upload.js";

export function messageRoutes(bot: Client): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const body = parse(sendMessageSchema, req.body);
      const result = await sendTextMessage(
        bot,
        {
          channelId: body.channelId,
          content: body.content,
        },
        guildIdOf(req),
      );
      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** Shim: mismo camino que POST /api/embeds/send. */
  router.post("/embed", optionalEmbedUpload, async (req, res, next) => {
    try {
      const payload = parse(sendEmbedSchema, req.body);
      const result = await sendAndRegisterEmbed(
        bot,
        payload,
        uploadedFromRequest(req),
        guildIdOf(req),
      );
      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
