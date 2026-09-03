import { z } from "zod";
import { snowflake, snowflakeList, snowflakeNull } from "#core/http/schemas.js";

const channelsMappingSchema = z.object({
  messages: snowflake.nullable().optional(),
  members: snowflake.nullable().optional(),
  roles: snowflake.nullable().optional(),
  channels: snowflake.nullable().optional(),
  voice: snowflake.nullable().optional(),
  assets: snowflake.nullable().optional(),
  invites: snowflake.nullable().optional(),
});

export const updateActionLogsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  routingMode: z.enum(["SIMPLE", "ADVANCED", "GLOBAL", "CATEGORY"]).optional(),
  globalChannelId: snowflakeNull,
  channelsMapping: channelsMappingSchema.optional(),
  channelsMap: channelsMappingSchema.optional(),
  ignoredChannels: snowflakeList.optional(),
  ignoredRoles: snowflakeList.optional(),
  ignoreBots: z.boolean().optional(),
  enabledEvents: z.record(z.string(), z.boolean()).optional(),
  dataRetentionDays: z
    .union([
      z.literal(0),
      z.literal(7),
      z.literal(14),
      z.literal(30),
      z.literal(90),
      z.literal(365),
    ])
    .optional(),
});

export const actionLogsHistoryQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
