import { z } from "zod";
import { boolish } from "#core/http/schemas.js";

export const updateReminderSettingsSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  enabled: boolish.optional(),
});
