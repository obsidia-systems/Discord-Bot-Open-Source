import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
  type EmbedUploadedFiles,
} from "./controller.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import { sendEmbedSchema, sendMessageSchema } from "../../../core/http/schemas.js";

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

function handleMessageError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof MessageSendError) {
    const errorBody: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(errorBody);
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "LIMIT_FILE_SIZE"
  ) {
    const errorBody: ApiErrorBody = {
      error: "La imagen supera el límite de 5MB.",
      code: "FILE_TOO_LARGE",
    };
    res.status(400).json(errorBody);
    return;
  }

  if (error instanceof Error && /Solo PNG|máx\. 5MB/i.test(error.message)) {
    const errorBody: ApiErrorBody = {
      error: error.message,
      code: "INVALID_FILE",
    };
    res.status(400).json(errorBody);
    return;
  }

  console.error("[adobos] Error inesperado en /api/messages:", error);
  const errorBody: ApiErrorBody = {
    error: "Error interno al enviar el mensaje.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(errorBody);
}

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
      handleMessageError(err, res);
      return;
    }
    next();
  });
}

export function messageRoutes(bot: Client): Router {
  const router = Router();

  router.post("/", async (req, res) => {
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
      handleMessageError(error, res);
    }
  });

  router.post("/embed", optionalEmbedUpload, async (req, res) => {
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
      handleMessageError(error, res);
    }
  });

  return router;
}
