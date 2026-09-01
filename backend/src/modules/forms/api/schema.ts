import { z } from "zod";
import { nonNegInt, snowflakeList, snowflakeNull } from "../../../core/http/schemas.js";

const formSelectOptionSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
});

const formQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(45),
  style: z.enum(["SHORT", "PARAGRAPH", "STRING_SELECT", "FILE_UPLOAD"]),
  required: z.boolean(),
  placeholder: z.string().max(100),
  options: z.array(formSelectOptionSchema).max(25).default([]),
});

export const createFormSchema = z.object({
  enabled: z.boolean().optional(),
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
  submitMode: z.enum(["cooldown", "once"]).optional(),
  cooldownMinutes: nonNegInt.optional(),
  requiredRoleIds: snowflakeList.max(20).optional(),
  blockedRoleIds: snowflakeList.max(20).optional(),
  pingRoleId: snowflakeNull,
  thankYouMessage: z.string().max(500).optional(),
  acceptRoleId: snowflakeNull,
});

export const updateFormSchema = createFormSchema.partial();
