import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { requireFeature } from "../../../core/entitlements/service.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import { updateBotGuildProfileSchema } from "../../../core/http/schemas.js";
import {
  BotProfileError,
  getGuildBotProfile,
  updateGuildBotProfile,
} from "../service.js";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Avatar: solo PNG, JPG, GIF o WEBP (máx. 8MB)."));
      return;
    }
    cb(null, true);
  },
});

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof BotProfileError) {
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
      error: "El avatar supera el límite de 8MB.",
      code: "FILE_TOO_LARGE",
    };
    res.status(400).json(body);
    return;
  }

  if (error instanceof Error && /Avatar:|solo PNG/i.test(error.message)) {
    const body: ApiErrorBody = {
      error: error.message,
      code: "INVALID_AVATAR",
    };
    res.status(400).json(body);
    return;
  }

  console.error("[adobos] Error en /api/bot/guild-profile:", error);
  const body: ApiErrorBody = {
    error: "Error interno al actualizar el perfil del servidor.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function botProfileRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await getGuildBotProfile(bot, guildId));
    } catch (error: unknown) {
      handleError(error, res);
    }
  });

  router.post("/", requireFeature("branding"), async (req, res) => {
    avatarUpload.single("serverAvatar")(req, res, async (err: unknown) => {
      if (err) {
        handleError(err, res);
        return;
      }

      try {
        const fields = parse(updateBotGuildProfileSchema, req.body ?? {});
        const guildId = guildIdOf(req);
        const file = req.file;

        const result = await updateGuildBotProfile(bot, {
          fields,
          avatarBuffer: file?.buffer,
          guildId,
        });
        res.json(result);
      } catch (error: unknown) {
        handleError(error, res);
      }
    });
  });

  return router;
}
