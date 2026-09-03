import {
  AUTO_REPLY_CHANNELS_MAX,
  AUTO_REPLY_COOLDOWN_MAX,
  AUTO_REPLY_MATCH_MODES,
  AUTO_REPLY_RESPONSE_MAX,
  AUTO_REPLY_TRIGGER_MAX,
} from "@adobos/shared";
import { z } from "zod";
import { boolish, nonNegInt, snowflakeList } from "#core/http/schemas.js";

export const createAutoReplySchema = z.object({
  trigger: z.string().min(1).max(AUTO_REPLY_TRIGGER_MAX),
  matchMode: z.enum(AUTO_REPLY_MATCH_MODES).optional(),
  response: z.string().min(1).max(AUTO_REPLY_RESPONSE_MAX),
  enabled: boolish.optional(),
  caseSensitive: boolish.optional(),
  wholeWord: boolish.optional(),
  useReply: boolish.optional(),
  cooldownSeconds: nonNegInt.max(AUTO_REPLY_COOLDOWN_MAX).optional(),
  allowedChannelIds: snowflakeList.max(AUTO_REPLY_CHANNELS_MAX).optional(),
  ignoredChannelIds: snowflakeList.max(AUTO_REPLY_CHANNELS_MAX).optional(),
});

export const updateAutoReplySchema = createAutoReplySchema.partial();
