import { CUSTOM_COMMAND_NAME_REGEX } from "@adobos/shared";
import { z } from "zod";
import { nonNegInt, snowflakeList } from "../../../core/http/schemas.js";

const customEmbedSchema = z.object({
  title: z.string(),
  description: z.string(),
  color: z.string(),
  imageUrl: z.string().nullable(),
});

const customResponseSchema = z.object({
  content: z.string(),
  embed: customEmbedSchema.nullable(),
});

const customOptionsSchema = z.object({
  ephemeral: z.boolean().optional(),
  dmResponse: z.boolean().optional(),
  autoDelete: z.boolean().optional(),
  cooldownSeconds: nonNegInt.optional(),
  disableMentions: z.boolean().optional(),
});

const customPermsSchema = z.object({
  allowedRoleIds: snowflakeList.optional(),
  ignoredRoleIds: snowflakeList.optional(),
  allowedChannelIds: snowflakeList.optional(),
  ignoredChannelIds: snowflakeList.optional(),
});

export const createCustomCommandSchema = z.object({
  name: z.string().regex(CUSTOM_COMMAND_NAME_REGEX),
  description: z.string().min(1).max(100),
  responseData: customResponseSchema,
  options: customOptionsSchema.optional(),
  permissions: customPermsSchema.optional(),
});

export const updateCustomCommandSchema = z.object({
  name: z.string().regex(CUSTOM_COMMAND_NAME_REGEX).optional(),
  description: z.string().min(1).max(100).optional(),
  responseData: customResponseSchema.optional(),
  options: customOptionsSchema.optional(),
  permissions: customPermsSchema.optional(),
});
