import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  BotActivityTypeName,
  BotPresenceStatus,
  UpdateBotProfileRequest,
} from "@adobos/shared";
import {
  BOT_ACTIVITY_TYPES,
  BOT_PRESENCE_STATUSES,
} from "@adobos/shared";
import { BotProfileError, getBotProfile, updateBotProfile } from "../service.js";

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

  console.error("[adobos] Error en /api/bot/profile:", error);
  const body: ApiErrorBody = {
    error: "Error interno al actualizar el perfil del bot.",
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

function parseFields(body: Record<string, unknown>): UpdateBotProfileRequest {
  const fields: UpdateBotProfileRequest = {};

  const username = optionalString(body.username);
  if (username !== undefined) fields.username = username;

  const status = optionalString(body.status);
  if (status !== undefined) {
    if (!BOT_PRESENCE_STATUSES.includes(status as BotPresenceStatus)) {
      throw new BotProfileError(
        "status debe ser online, idle, dnd o invisible.",
        400,
        "INVALID_STATUS",
      );
    }
    fields.status = status as BotPresenceStatus;
  }

  const activityType = optionalString(body.activityType);
  if (activityType !== undefined) {
    if (!BOT_ACTIVITY_TYPES.includes(activityType as BotActivityTypeName)) {
      throw new BotProfileError(
        "activityType no reconocido.",
        400,
        "INVALID_ACTIVITY_TYPE",
      );
    }
    fields.activityType = activityType as BotActivityTypeName;
  }

  const activityName = optionalString(body.activityName);
  if (activityName !== undefined) fields.activityName = activityName;

  const streamUrl = optionalString(body.streamUrl);
  if (streamUrl !== undefined) fields.streamUrl = streamUrl;

  const state = optionalString(body.state);
  if (state !== undefined) fields.state = state;

  const clearActivity = optionalBool(body.clearActivity);
  if (clearActivity !== undefined) fields.clearActivity = clearActivity;

  return fields;
}

export function botProfileRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      res.json(await getBotProfile(bot));
    } catch (error: unknown) {
      handleError(error, res);
    }
  });

  router.post("/", (req, res) => {
    avatarUpload.single("avatar")(req, res, async (err: unknown) => {
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
        const file = req.file;

        const result = await updateBotProfile(bot, {
          fields,
          avatarBuffer: file?.buffer,
          avatarMime: file?.mimetype,
        });
        res.json(result);
      } catch (error: unknown) {
        handleError(error, res);
      }
    });
  });

  return router;
}
