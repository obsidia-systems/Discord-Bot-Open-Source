import { z } from "zod";
import { nonNegInt, snowflakeNull } from "../../../core/http/schemas.js";

const formQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(45),
  style: z.enum(["SHORT", "PARAGRAPH"]),
  required: z.boolean(),
  placeholder: z.string().max(100),
});

export const createFormSchema = z.object({
  modalTitle: z.string().max(45).optional(),
  buttonLabel: z.string().max(80).optional(),
  embedTitle: z.string().max(256).optional(),
  embedDescription: z.string().max(4096).optional(),
  embedColor: z.string().optional(),
  embedImageUrl: z.string().nullable().optional(),
  embedThumbnailUrl: z.string().nullable().optional(),
  publishChannelId: snowflakeNull,
  receptionChannelId: snowflakeNull,
  questions: z.array(formQuestionSchema).max(5).optional(),
  cooldownMinutes: nonNegInt.optional(),
});

export const updateFormSchema = createFormSchema.partial();
