import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { stringId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import { editSentEmbedSchema, sendEmbedSchema } from "./schema.js";
import {
  deleteSentEmbed,
  editSentEmbed,
  getEmbedLibrary,
  sendAndRegisterEmbed,
} from "../library.js";
import { optionalEmbedUpload, uploadedFromRequest } from "./upload.js";

export function embedLibraryRoutes(bot: Client): Router {
  const router = Router();

  router.get("/library", async (req, res, next) => {
    try {
      res.json(await getEmbedLibrary(bot, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/send", optionalEmbedUpload, async (req, res, next) => {
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

  router.put("/edit-sent/:id", optionalEmbedUpload, async (req, res, next) => {
    try {
      const id = parse(stringId, req.params.id);
      const payload = parse(editSentEmbedSchema, req.body);
      const result = await editSentEmbed(
        bot,
        id,
        payload,
        uploadedFromRequest(req),
        guildIdOf(req),
      );
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/sent/:id", async (req, res, next) => {
    try {
      const id = parse(stringId, req.params.id);
      const result = await deleteSentEmbed(bot, id, guildIdOf(req));
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
