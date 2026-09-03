import {
  STARBOARD_EMOJIS_MAX,
  STARBOARD_IGNORE_CHANNELS_MAX,
  STARBOARD_THRESHOLD_MAX,
  STARBOARD_THRESHOLD_MIN,
} from "@adobos/shared";
import { z } from "zod";
import {
  boolish,
  pre,
  snowflakeList,
  snowflakeNull,
} from "../../../core/http/schemas.js";

export const updateStarboardSettingsSchema = z.object({
  channelId: pre((value) => (value === "" ? null : value), snowflakeNull),
  emojis: z
    .array(z.string().min(1).max(64))
    .max(STARBOARD_EMOJIS_MAX)
    .optional(),
  threshold: z
    .number()
    .int()
    .min(STARBOARD_THRESHOLD_MIN)
    .max(STARBOARD_THRESHOLD_MAX)
    .optional(),
  enabled: boolish.optional(),
  allowSelfStar: boolish.optional(),
  allowBots: boolish.optional(),
  ignoreChannelIds: snowflakeList.max(STARBOARD_IGNORE_CHANNELS_MAX).optional(),
});
