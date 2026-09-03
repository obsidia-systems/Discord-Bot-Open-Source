import { z } from "zod";
import { snowflake, snowflakeList, snowflakeNull } from "#core/http/schemas.js";

export const updateGiveawaySettingsSchema = z.object({
  managerRoleIds: snowflakeList.max(20).optional(),
  dmWinners: z.boolean().optional(),
  pingRoleId: snowflakeNull,
});

export const createGiveawaySchema = z.object({
  channelId: snowflake,
  prize: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  winnerCount: z.number().int().min(1).max(20).optional(),
  durationMinutes: z.number().int().min(1).max(43200).optional(),
  startsAt: z.string().nullable().optional(),
  requiredRoleIds: snowflakeList.max(20).optional(),
  blockedRoleIds: snowflakeList.max(20).optional(),
  minGuildAgeDays: z.number().int().min(0).max(365).optional(),
  minAccountAgeDays: z.number().int().min(0).max(365).optional(),
});
