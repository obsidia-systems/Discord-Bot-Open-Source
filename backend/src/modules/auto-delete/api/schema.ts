import { z } from "zod";
import { nonNegInt, snowflake, weekday } from "../../../core/http/schemas.js";

const autoDeleteRuleSchema = z.object({
  channelId: snowflake,
  mode: z.enum(["COUNTDOWN", "SCHEDULED"]),
  delayValue: nonNegInt,
  delayUnit: z.enum(["seconds", "minutes", "hours"]),
  scheduledTime: z.string(),
  scheduledDays: z.array(weekday),
  filterType: z.enum(["all", "bots_only", "no_attachments"]),
});

export const updateAutoDeleteConfigSchema = z.object({
  enabled: z.boolean().optional(),
  rules: z.array(autoDeleteRuleSchema).optional(),
});
