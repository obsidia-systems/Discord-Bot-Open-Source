import { z } from "zod";
import { BOT_GUILD_NICKNAME_MAX } from "@adobos/shared";
import { boolish } from "../../../core/http/schemas.js";

export const updateBotGuildProfileSchema = z.object({
  nickname: z.string().max(BOT_GUILD_NICKNAME_MAX).nullable().optional(),
  clearNickname: boolish.optional(),
  serverAvatarUrl: z.string().nullable().optional(),
  clearServerAvatar: boolish.optional(),
});
