import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { sendAndRegisterEmbed } from "../library.js";
import { sendTextMessage } from "./controller.js";
import { sendEmbedSchema, sendMessageSchema } from "./schema.js";
import { optionalEmbedUpload, uploadedFromRequest } from "./upload.js";

export function messageRoutes(bot: Client): Router {
  const router = Router();

  router.post(
    "/",
    defineRoute({ body: sendMessageSchema }, async (req, res, valid) => {
      const result = await sendTextMessage(
        bot,
        { channelId: valid.body.channelId, content: valid.body.content },
        guildIdOf(req),
      );
      res.status(201).json(result);
    }),
  );

  /** Shim: mismo camino que POST /api/embeds/send. */
  router.post(
    "/embed",
    optionalEmbedUpload,
    defineRoute({ body: sendEmbedSchema }, async (req, res, valid) => {
      const result = await sendAndRegisterEmbed(
        bot,
        valid.body,
        uploadedFromRequest(req),
        guildIdOf(req),
      );
      res.status(201).json(result);
    }),
  );

  return router;
}
