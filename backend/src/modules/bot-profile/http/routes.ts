import type { Client } from "discord.js";
import { Router } from "express";
import multer from "multer";
import { requireFeature } from "#core/entitlements/service.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getGuildBotProfile, updateGuildBotProfile } from "../discord.js";
import { updateBotGuildProfileSchema } from "./schema.js";

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
      cb(new Error("Avatar: only PNG, JPG, GIF or WEBP (max 8MB)."));
      return;
    }
    cb(null, true);
  },
});

export function botProfileRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getGuildBotProfile(bot, guildIdOf(req)));
    }),
  );

  router.post(
    "/",
    requireFeature("branding"),
    avatarUpload.single("serverAvatar"),
    defineRoute(
      { body: updateBotGuildProfileSchema },
      async (req, res, valid) => {
        const result = await updateGuildBotProfile(bot, {
          fields: valid.body,
          avatarBuffer: req.file?.buffer,
          guildId: guildIdOf(req),
        });
        res.json(result);
      },
    ),
  );

  return router;
}
