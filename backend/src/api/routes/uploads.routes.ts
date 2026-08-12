import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { Router, type Request, type Response } from "express";
import type { ApiErrorBody } from "@adobos/shared";
import { getBackgroundsDir, getImagesDir } from "../../lib/dataPaths.js";

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
        cb(
          new Error(
            "Solo se permiten imágenes PNG, JPG o WEBP (máx. 5MB).",
          ),
        );
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
    const body: ApiErrorBody = {
      error: "No se recibió ningún archivo (campo `file`).",
      code: "NO_FILE",
    };
    res.status(400).json(body);
    return;
  }

  const publicPath = `/uploads/${publicDir}/${req.file.filename}`;
  res.json({
    ok: true as const,
    path: publicPath,
    filename: req.file.filename,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
}

function multerErrorHandler(err: unknown, res: Response): boolean {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : "No se pudo subir el archivo.";
  const isLimit =
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "LIMIT_FILE_SIZE";
  const body: ApiErrorBody = {
    error: isLimit ? "La imagen supera el límite de 5MB." : message,
    code: isLimit ? "FILE_TOO_LARGE" : "UPLOAD_ERROR",
  };
  res.status(400).json(body);
  return true;
}

export function uploadRoutes(): Router {
  const router = Router();

  /** POST /api/uploads/background — fondos de bienvenida → /uploads/backgrounds/ */
  router.post("/background", (req, res) => {
    uploadBackground.single("file")(req, res, (err: unknown) => {
      if (multerErrorHandler(err, res)) return;
      handleUpload(req, res, "backgrounds");
    });
  });

  /** POST /api/uploads/image — embeds / iconos / genérico → /uploads/images/ */
  router.post("/image", (req, res) => {
    uploadImage.single("file")(req, res, (err: unknown) => {
      if (multerErrorHandler(err, res)) return;
      handleUpload(req, res, "images");
    });
  });

  return router;
}
