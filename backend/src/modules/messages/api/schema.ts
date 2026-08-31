import { z } from "zod";
import {
  boolish,
  embedPayloadSchema,
  emptyToUndef,
  pre,
  snowflake,
  snowflakeOpt,
  stringId,
} from "../../../core/http/schemas.js";

const buttonStyle = z.enum([
  "Primary",
  "Secondary",
  "Success",
  "Danger",
  "Link",
]);

const messageButtonSchema = z.object({
  label: z.string().min(1),
  style: buttonStyle,
  customId: z.string().optional(),
  url: z.string().optional(),
  disabled: z.boolean().optional(),
  emoji: z.string().optional(),
});

const actionRowSchema = z.object({
  buttons: z.array(messageButtonSchema).min(1).max(5),
});

export const sendMessageSchema = z.object({
  channelId: snowflake,
  content: z.string().min(1).max(2000),
});

export const sendEmbedSchema = z.object({
  channelId: snowflake,
  content: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  authorName: z.string().optional(),
  authorIconUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  footerText: z.string().optional(),
  footerIconUrl: z.string().optional(),
  timestamp: boolish.optional(),
  components: pre((value) => {
    if (value === "" || value === undefined || value === null) return undefined;
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }
    return value;
  }, z.array(actionRowSchema).optional()),
});

export const editSentEmbedSchema = sendEmbedSchema.extend({
  channelId: pre(emptyToUndef, snowflake.optional()),
});

export const saveEmbedTemplateSchema = z.object({
  id: pre(emptyToUndef, z.coerce.number().int().positive().optional()),
  guildId: snowflakeOpt,
  name: z.string().min(1).max(100),
  embedData: pre((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }
    return value;
  }, embedPayloadSchema),
});

export { stringId };
