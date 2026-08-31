import multer from "multer";
import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { requireFeature } from "../../../core/entitlements/service.js";
import { parse } from "../../../core/http/validate.js";
import { updateBotGuildProfileSchema } from "./schema.js";
import {
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

export function botProfileRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await getGuildBotProfile(bot, guildId));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", requireFeature("branding"), async (req, res, next) => {
    avatarUpload.single("serverAvatar")(req, res, async (err: unknown) => {
      if (err) {
        next(err);
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
        next(error);
      }
    });
  });

  return router;
}
