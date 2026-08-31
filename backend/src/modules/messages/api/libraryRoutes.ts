import { Router } from "express";
import multer from "multer";
import type { Client } from "discord.js";
import type { EmbedUploadedFiles } from "./controller.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import {
  editSentEmbedSchema,
  sendEmbedSchema,
  stringId,
} from "../../../core/http/schemas.js";
import {
  deleteSentEmbed,
  editSentEmbed,
  getEmbedLibrary,
  sendAndRegisterEmbed,
} from "../library.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function firstFile(
  files: Express.Multer.File[] | undefined,
): Express.Multer.File | undefined {
  return files?.[0];
}

function uploadedFromRequest(req: { files?: unknown }): EmbedUploadedFiles {
  const uploadedMap = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;
  return {
    image: firstFile(uploadedMap?.image),
    thumbnail: firstFile(uploadedMap?.thumbnail),
    authorIcon: firstFile(uploadedMap?.authorIcon),
    footerIcon: firstFile(uploadedMap?.footerIcon),
  };
}

export function embedLibraryRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/embeds/library */
  router.get("/library", async (req, res, next) => {
    try {
      res.json(await getEmbedLibrary(bot, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  /** POST /api/embeds/send */
  router.post(
    "/send",
    upload.fields([
      { name: "image", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
      { name: "authorIcon", maxCount: 1 },
      { name: "footerIcon", maxCount: 1 },
    ]),
    async (req, res, next) => {
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
    },
  );

  /** PUT /api/embeds/edit-sent/:id */
  router.put(
    "/edit-sent/:id",
    upload.fields([
      { name: "image", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
      { name: "authorIcon", maxCount: 1 },
      { name: "footerIcon", maxCount: 1 },
    ]),
    async (req, res, next) => {
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
    },
  );

  /** DELETE /api/embeds/sent/:id */
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
