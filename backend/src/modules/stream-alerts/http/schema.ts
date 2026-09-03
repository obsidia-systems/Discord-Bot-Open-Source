import {
  STREAM_ALERT_PLATFORMS,
  STREAM_ALERT_TEMPLATE_MAX,
} from "@adobos/shared";
import { z } from "zod";
import { boolish, snowflake, snowflakeNull } from "#core/http/schemas.js";

export const createStreamAlertSchema = z.object({
  platform: z.enum(STREAM_ALERT_PLATFORMS),
  handle: z.string().min(1).max(128),
  discordChannelId: snowflake,
  mentionRoleId: snowflakeNull,
  template: z.string().max(STREAM_ALERT_TEMPLATE_MAX).optional(),
  enabled: boolish.optional(),
});

export const updateStreamAlertSchema = createStreamAlertSchema.partial();
