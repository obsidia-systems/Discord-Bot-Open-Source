import { AUTO_DELETE_MAX_RULES } from "@adobos/shared";
import { z } from "zod";
import { nonNegInt, snowflake, weekday } from "../../../core/http/schemas.js";

const autoDeleteRuleSchema = z.object({
  channelId: snowflake,
  mode: z.enum(["COUNTDOWN", "SCHEDULED"]),
  delayValue: nonNegInt,
  delayUnit: z.enum(["seconds", "minutes", "hours"]),
  scheduledTime: z.string().max(8),
  scheduledDays: z.array(weekday),
  filterType: z.enum(["all", "bots_only", "no_attachments"]),
});

export const updateAutoDeleteConfigSchema = z.object({
  enabled: z.boolean().optional(),
  rules: z.array(autoDeleteRuleSchema).max(AUTO_DELETE_MAX_RULES).optional(),
  timezone: z.string().min(1).max(64).optional(),
});
