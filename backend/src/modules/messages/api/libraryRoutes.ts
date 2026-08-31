import { Router } from "express";
import multer from "multer";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  EditSentEmbedRequest,
  SendEmbedRequest,
} from "@adobos/shared";
import { MessageSendError } from "./controller.js";
import type { EmbedUploadedFiles } from "./controller.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseComponents(raw: unknown): SendEmbedRequest["components"] {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as SendEmbedRequest["components"];
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(raw)) {
    return raw as SendEmbedRequest["components"];
  }
  return undefined;
}

function handleError(
  error: unknown,
  res: import("express").Response,
): void {
  if (error instanceof MessageSendError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    } satisfies ApiErrorBody);
    return;
  }
  console.error("[adobos] Error en /api/embeds:", error);
  res.status(500).json({
    error: "Error interno de embeds.",
    code: "INTERNAL_ERROR",
  } satisfies ApiErrorBody);
}

function firstFile(
  files: Express.Multer.File[] | undefined,
): Express.Multer.File | undefined {
  return files?.[0];
}

function parseBodyPayload(body: Record<string, unknown>): SendEmbedRequest {
  return {
    channelId: String(body.channelId ?? ""),
    content: optionalString(body.content),
    title: optionalString(body.title),
    url: optionalString(body.url),
    description: optionalString(body.description),
    color: optionalString(body.color),
    authorName: optionalString(body.authorName),
    authorIconUrl: optionalString(body.authorIconUrl),
    thumbnailUrl: optionalString(body.thumbnailUrl),
    imageUrl: optionalString(body.imageUrl),
    footerText: optionalString(body.footerText),
    footerIconUrl: optionalString(body.footerIconUrl),
    timestamp: optionalBoolean(body.timestamp),
    components: parseComponents(body.components),
  };
}

export function embedLibraryRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/embeds/library */
  router.get("/library", (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(getEmbedLibrary(bot, guildId));
    } catch (error: unknown) {
      handleError(error, res);
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
    async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.channelId !== "string" || !body.channelId.trim()) {
          res.status(400).json({
            error: "channelId es obligatorio.",
            code: "INVALID_BODY",
          } satisfies ApiErrorBody);
          return;
        }
        const payload = parseBodyPayload(body);
        const uploadedMap = req.files as
          | { [fieldname: string]: Express.Multer.File[] }
          | undefined;
        const uploaded: EmbedUploadedFiles = {
          image: firstFile(uploadedMap?.image),
          thumbnail: firstFile(uploadedMap?.thumbnail),
          authorIcon: firstFile(uploadedMap?.authorIcon),
          footerIcon: firstFile(uploadedMap?.footerIcon),
        };
        const result = await sendAndRegisterEmbed(
          bot,
          payload,
          uploaded,
          guildIdOf(req),
        );
        res.status(201).json(result);
      } catch (error: unknown) {
        handleError(error, res);
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
    async (req, res) => {
      const id = String(req.params.id);
      const guildId =
        guildIdOf(req);
      try {
        const body = req.body as Record<string, unknown>;
        const payload: EditSentEmbedRequest = parseBodyPayload(body);
        const uploadedMap = req.files as
          | { [fieldname: string]: Express.Multer.File[] }
          | undefined;
        const uploaded: EmbedUploadedFiles = {
          image: firstFile(uploadedMap?.image),
          thumbnail: firstFile(uploadedMap?.thumbnail),
          authorIcon: firstFile(uploadedMap?.authorIcon),
          footerIcon: firstFile(uploadedMap?.footerIcon),
        };
        const result = await editSentEmbed(bot, id, payload, uploaded, guildId);
        res.json(result);
      } catch (error: unknown) {
        handleError(error, res);
      }
    },
  );

  /** DELETE /api/embeds/sent/:id */
  router.delete("/sent/:id", async (req, res) => {
    const id = String(req.params.id);
    const guildId =
      guildIdOf(req);
    try {
      const result = await deleteSentEmbed(bot, id, guildId);
      res.json(result);
    } catch (error: unknown) {
      handleError(error, res);
    }
  });

  return router;
}
