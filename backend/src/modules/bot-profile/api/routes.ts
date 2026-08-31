import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody, UpdateBotGuildProfileRequest } from "@adobos/shared";
import { guildIdOf } from "../../../core/http/guildContext.js";
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

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value;
}

function optionalBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function parseFields(
  body: Record<string, unknown>,
): UpdateBotGuildProfileRequest {
  const fields: UpdateBotGuildProfileRequest = {};

  const nickname = optionalString(body.nickname);
  if (nickname !== undefined) fields.nickname = nickname;

  const clearNickname = optionalBool(body.clearNickname);
  if (clearNickname !== undefined) fields.clearNickname = clearNickname;

  const serverAvatarUrl = optionalString(body.serverAvatarUrl);
  if (serverAvatarUrl !== undefined) fields.serverAvatarUrl = serverAvatarUrl;

  const clearServerAvatar = optionalBool(body.clearServerAvatar);
  if (clearServerAvatar !== undefined) {
    fields.clearServerAvatar = clearServerAvatar;
  }

  return fields;
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

  router.post("/", async (req, res) => {
    avatarUpload.single("serverAvatar")(req, res, async (err: unknown) => {
      if (err) {
        handleError(err, res);
        return;
      }

      try {
        const rawBody =
          req.body && typeof req.body === "object"
            ? (req.body as Record<string, unknown>)
            : {};
        const fields = parseFields(rawBody);
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
