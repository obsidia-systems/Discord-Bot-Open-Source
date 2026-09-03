import { z } from "zod";
import {
  nonNegInt,
  posInt,
  snowflake,
  snowflakeOpt,
} from "#core/http/schemas.js";

export const fetchMessageQuerySchema = z.object({
  channelId: snowflake,
  messageId: snowflake,
});

export const discordAuditQuerySchema = z.object({
  userId: snowflake.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  actionType: z.coerce.number().int().optional(),
});

export const modActionSchema = z.object({
  action: z.enum([
    "ban",
    "kick",
    "timeout",
    "untimeout",
    "warn",
    "unban",
    "purge",
    "slowmode",
    "lock",
    "unlock",
    "clearwarns",
  ]),
  guildId: snowflakeOpt,
  userId: snowflakeOpt,
  channelId: snowflakeOpt,
  reason: z.string().max(512),
  durationSeconds: nonNegInt.optional(),
  deleteMessageDays: z.number().int().min(0).max(7).optional(),
  purgeLimit: z.number().int().min(1).max(100).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
  dmMode: z.enum(["none", "text", "template"]).optional(),
  dmText: z.string().max(2000).optional(),
  templateId: posInt.optional(),
});
