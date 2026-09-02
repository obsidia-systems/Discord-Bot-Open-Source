import { z } from "zod";
import {
  boolish,
  embedFieldSchema,
  embedPayloadSchema,
  emptyToUndef,
  parseJsonish,
  pre,
  snowflake,
  snowflakeOpt,
} from "../../../core/http/schemas.js";

const linkButtonSchema = z.object({
  label: z.string().min(1).max(80),
  style: z.literal("Link"),
  url: z.string().min(1),
  disabled: z.boolean().optional(),
  emoji: z.string().optional(),
});

const linkActionRowSchema = z.object({
  buttons: z.array(linkButtonSchema).min(1).max(5),
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
  fields: pre(parseJsonish, z.array(embedFieldSchema).max(25).optional()),
  components: pre(
    parseJsonish,
    z.array(linkActionRowSchema).max(5).optional(),
  ),
});

export const editSentEmbedSchema = sendEmbedSchema.extend({
  channelId: pre(emptyToUndef, snowflake.optional()),
});

export const saveEmbedTemplateSchema = z.object({
  id: pre(emptyToUndef, z.coerce.number().int().positive().optional()),
  guildId: snowflakeOpt,
  name: z.string().min(1).max(100),
  embedData: pre(parseJsonish, embedPayloadSchema),
});
