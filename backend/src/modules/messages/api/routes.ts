import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import {
  sendEmbedMessage,
  sendTextMessage,
  type EmbedUploadedFiles,
} from "./controller.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { sendEmbedSchema, sendMessageSchema } from "./schema.js";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const embedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Solo PNG, JPG o WEBP (máx. 5MB)."));
      return;
    }
    cb(null, true);
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "authorIcon", maxCount: 1 },
  { name: "footerIcon", maxCount: 1 },
]);

function firstFile(
  files: Express.Multer.File[] | undefined,
): Express.Multer.File | undefined {
  return files?.[0];
}

function optionalEmbedUpload(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    next();
    return;
  }
  embedUpload(req, res, (err: unknown) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

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

  router.post("/embed", optionalEmbedUpload, async (req, res, next) => {
    try {
      const payload = parse(sendEmbedSchema, req.body);

      const uploadedMap = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      const uploaded: EmbedUploadedFiles = {
        image: firstFile(uploadedMap?.image),
        thumbnail: firstFile(uploadedMap?.thumbnail),
        authorIcon: firstFile(uploadedMap?.authorIcon),
        footerIcon: firstFile(uploadedMap?.footerIcon),
      };

      const result = await sendEmbedMessage(
        bot,
        payload,
        uploaded,
        guildIdOf(req),
      );
      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
