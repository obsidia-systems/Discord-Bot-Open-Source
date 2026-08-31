import { z } from "zod";
import { boolish } from "../../../core/http/schemas.js";

export const updateBotGuildProfileSchema = z.object({
  nickname: z.string().max(32).nullable().optional(),
  clearNickname: boolish.optional(),
  serverAvatarUrl: z.string().nullable().optional(),
  clearServerAvatar: boolish.optional(),
});
