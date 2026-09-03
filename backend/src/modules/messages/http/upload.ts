import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { EmbedUploadedFiles } from "./controller.js";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const embedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Only PNG, JPG, WEBP or GIF (max 5MB)."));
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

export function uploadedFromRequest(req: {
  files?: unknown;
}): EmbedUploadedFiles {
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

/** Multer solo si el body es multipart; JSON pasa de largo. */
export function optionalEmbedUpload(
  req: Request,
  res: Response,
  next: NextFunction,
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
