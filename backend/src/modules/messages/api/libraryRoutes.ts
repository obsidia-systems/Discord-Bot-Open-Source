import type { Client } from "discord.js";
import { Router } from "express";
import { z } from "zod";
import { guildIdOf } from "#core/http/guildContext.js";
import { stringId } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  deleteSentEmbed,
  editSentEmbed,
  getEmbedLibrary,
  sendAndRegisterEmbed,
} from "../library.js";
import { editSentEmbedSchema, sendEmbedSchema } from "./schema.js";
import { optionalEmbedUpload, uploadedFromRequest } from "./upload.js";

const sentIdParams = z.object({ id: stringId });

export function embedLibraryRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/library",
    defineRoute({}, async (req, res) => {
      res.json(await getEmbedLibrary(bot, guildIdOf(req)));
    }),
  );

  router.post(
    "/send",
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

  router.put(
    "/edit-sent/:id",
    optionalEmbedUpload,
    defineRoute(
      { params: sentIdParams, body: editSentEmbedSchema },
      async (req, res, valid) => {
        const result = await editSentEmbed(
          bot,
          valid.params.id,
          valid.body,
          uploadedFromRequest(req),
          guildIdOf(req),
        );
        res.json(result);
      },
    ),
  );

  router.delete(
    "/sent/:id",
    defineRoute({ params: sentIdParams }, async (req, res, valid) => {
      const result = await deleteSentEmbed(
        bot,
        valid.params.id,
        guildIdOf(req),
      );
      res.json(result);
    }),
  );

  return router;
}
