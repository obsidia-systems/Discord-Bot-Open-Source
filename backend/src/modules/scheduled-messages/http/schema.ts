import { z } from "zod";
import {
  boolish,
  snowflake,
  snowflakeNull,
  weekday,
} from "#core/http/schemas.js";

const scheduledFrequencySchema = z.object({
  type: z.enum(["daily", "weekly", "monthly", "specific_date", "interval"]),
  time: z.string().min(1),
  days: z.array(weekday),
  dayOfMonth: z.number().int().min(1).max(31),
  date: z.string(),
  repeatYearly: z.boolean(),
  lastDayOfMonth: z.boolean().default(false),
  everyMinutes: z.number().int().default(120),
});

const scheduledEmbedSchema = z.object({
  title: z.string(),
  description: z.string(),
  color: z.string(),
  imageUrl: z.string().nullable(),
});

export const createScheduledMessageSchema = z.object({
  channelId: snowflake,
  timezone: z.string().min(1).max(64),
  frequency: scheduledFrequencySchema,
  embedData: scheduledEmbedSchema,
  content: z.string().max(2000).optional(),
  pingRoleId: snowflakeNull,
  isActive: z.boolean().optional(),
});

export const updateScheduledMessageSchema =
  createScheduledMessageSchema.partial();

export const toggleScheduledSchema = z.object({
  isActive: boolish,
});
