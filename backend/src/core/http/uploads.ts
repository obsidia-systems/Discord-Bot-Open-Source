import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { HttpError } from "#core/http/httpError.js";
import { getBackgroundsDir, getImagesDir } from "#lib/dataPaths.js";
import { sniffImageFile } from "#lib/imageMagic.js";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MAX_BYTES = 5 * 1024 * 1024;

function safeImageExt(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === ".png" || ext === ".webp") return ext;
  if (ext === ".jpg" || ext === ".jpeg") return ".jpg";
  return ".png";
}

function createUploader(destination: () => string) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, destination());
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
  });

  return multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new Error("Only PNG, JPG or WEBP images are allowed (max 5MB)."));
        return;
      }
      cb(null, true);
    },
  });
}

const uploadBackground = createUploader(getBackgroundsDir);
const uploadImage = createUploader(getImagesDir);

function handleUpload(
  req: Request,
  res: Response,
  publicDir: "backgrounds" | "images",
): void {
  if (!req.file) {
    throw new HttpError("No file received (field `file`).", 400, "NO_FILE");
  }

  const sniffed = sniffImageFile(req.file.path);
  if (!sniffed) {
    fs.unlink(req.file.path, () => undefined);
    throw new HttpError(
      "The file is not a valid PNG, JPG or WEBP image.",
      400,
      "INVALID_IMAGE_CONTENT",
    );
  }

  const publicPath = `/uploads/${publicDir}/${req.file.filename}`;
  res.json({
    ok: true as const,
    path: publicPath,
    filename: req.file.filename,
    size: req.file.size,
    mimeType: sniffed,
  });
}

export function uploadRoutes(): Router {
  const router = Router();

  // Multer va como middleware directo: propaga sus errores con `next(err)`.
  // El throw síncrono de `handleUpload` (HttpError) lo enruta Express al
  // errorHandler — sin envoltorio try/catch.

  /** POST /api/uploads/background — fondos de bienvenida → /uploads/backgrounds/ */
  router.post("/background", uploadBackground.single("file"), (req, res) => {
    handleUpload(req, res, "backgrounds");
  });

  /** POST /api/uploads/image — embeds / iconos / genérico → /uploads/images/ */
  router.post("/image", uploadImage.single("file"), (req, res) => {
    handleUpload(req, res, "images");
  });

  return router;
}
