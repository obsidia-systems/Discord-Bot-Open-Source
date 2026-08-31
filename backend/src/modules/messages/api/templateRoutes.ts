import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  EmbedPayload,
  SaveEmbedTemplateRequest,
} from "@adobos/shared";
import { getTemplatesDir } from "../../../lib/dataPaths.js";
import { sniffImageFile } from "../../../lib/imageMagic.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import {
  EmbedTemplateError,
  deleteEmbedTemplate,
  getEmbedTemplate,
  listEmbedTemplates,
  saveEmbedTemplate,
} from "../templates/service.js";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function safeImageExt(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === ".png" || ext === ".webp" || ext === ".gif") return ext;
  if (ext === ".jpg" || ext === ".jpeg") return ".jpg";
  return ".png";
}

const templateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, getTemplatesDir());
      } catch (error) {
        cb(error as Error, "");
      }
    },
    filename: (_req, file, cb) => {
      cb(
        null,
        `${Date.now()}-${randomUUID().slice(0, 8)}${safeImageExt(file.originalname)}`,
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Solo PNG, JPG, WEBP o GIF (máx. 5MB)."));
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

function handleError(
  error: unknown,
  res: import("express").Response,
): void {
  if (error instanceof EmbedTemplateError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "LIMIT_FILE_SIZE"
  ) {
    const body: ApiErrorBody = {
      error: "La imagen supera el límite de 5MB.",
      code: "FILE_TOO_LARGE",
    };
    res.status(400).json(body);
    return;
  }

  if (error instanceof Error && /Solo PNG|máx\. 5MB/i.test(error.message)) {
    const body: ApiErrorBody = {
      error: error.message,
      code: "INVALID_FILE",
    };
    res.status(400).json(body);
    return;
  }

  console.error("[adobos] Error en /api/embeds/templates:", error);
  const body: ApiErrorBody = {
    error: "Error interno de plantillas.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

function parseEmbedDataField(raw: unknown): EmbedPayload {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as EmbedPayload;
    } catch {
      throw new EmbedTemplateError(
        "embedData JSON inválido.",
        400,
        "INVALID_EMBED_DATA",
      );
    }
  }
  if (raw && typeof raw === "object") {
    return raw as EmbedPayload;
  }
  return {};
}

function publicTemplatePath(filename: string): string {
  return `/uploads/templates/${filename}`;
}

function assertSniffedTemplateFiles(
  files: Record<string, Express.Multer.File[]> | undefined,
): void {
  const uploaded = [
    ...(files?.image ?? []),
    ...(files?.thumbnail ?? []),
    ...(files?.authorIcon ?? []),
    ...(files?.footerIcon ?? []),
  ];
  for (const file of uploaded) {
    if (!sniffImageFile(file.path)) {
      fs.unlink(file.path, () => undefined);
      throw new EmbedTemplateError(
        "El archivo no es una imagen PNG, JPG, WEBP o GIF válida.",
        400,
        "INVALID_IMAGE_CONTENT",
      );
    }
  }
}

export function embedTemplateRoutes(_bot: Client): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(listEmbedTemplates(guildId));
    } catch (error: unknown) {
      handleError(error, res);
    }
  });

  router.post("/", (req, res) => {
    templateUpload(req, res, (err: unknown) => {
      if (err) {
        handleError(err, res);
        return;
      }

      try {
        const files = req.files as
          | Record<string, Express.Multer.File[]>
          | undefined;
        assertSniffedTemplateFiles(files);

        const contentType = String(req.headers["content-type"] ?? "");
        const isMultipart = contentType.includes("multipart/form-data");

        let payload: SaveEmbedTemplateRequest;

        if (isMultipart) {
          const idRaw =
            typeof req.body.id === "string" && req.body.id.trim()
              ? Number.parseInt(req.body.id, 10)
              : undefined;
          payload = {
            id: Number.isFinite(idRaw) ? idRaw : undefined,
            guildId:
              typeof req.body.guildId === "string"
                ? req.body.guildId
                : undefined,
            name: typeof req.body.name === "string" ? req.body.name : "",
            embedData: parseEmbedDataField(req.body.embedData),
          };
        } else {
          payload = req.body as SaveEmbedTemplateRequest;
        }

        const uploadedPaths: {
          imageUrl?: string;
          thumbnailUrl?: string;
          authorIconUrl?: string;
          footerIconUrl?: string;
        } = {};

        const image = files?.image?.[0];
        const thumbnail = files?.thumbnail?.[0];
        const authorIcon = files?.authorIcon?.[0];
        const footerIcon = files?.footerIcon?.[0];

        if (image) uploadedPaths.imageUrl = publicTemplatePath(image.filename);
        if (thumbnail) {
          uploadedPaths.thumbnailUrl = publicTemplatePath(thumbnail.filename);
        }
        if (authorIcon) {
          uploadedPaths.authorIconUrl = publicTemplatePath(authorIcon.filename);
        }
        if (footerIcon) {
          uploadedPaths.footerIconUrl = publicTemplatePath(footerIcon.filename);
        }

        res.json(saveEmbedTemplate(payload, uploadedPaths));
      } catch (error: unknown) {
        handleError(error, res);
      }
    });
  });

  router.get("/:id", (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      const id = Number.parseInt(req.params.id ?? "", 10);
      if (!Number.isFinite(id)) {
        throw new EmbedTemplateError("id inválido.", 400, "INVALID_ID");
      }
      res.json(getEmbedTemplate(id, guildId));
    } catch (error: unknown) {
      handleError(error, res);
    }
  });

  router.delete("/:id", (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(deleteEmbedTemplate(req.params.id ?? "", guildId));
    } catch (error: unknown) {
      handleError(error, res);
    }
  });

  return router;
}
