import { z } from "zod";
import {
  embedPayloadSchema,
  posInt,
  snowflake,
  snowflakeList,
  snowflakeOpt,
} from "../../../core/http/schemas.js";

const reactionMappingSchema = z.object({
  emojiKey: z.string().min(1),
  roleId: snowflake,
});

const buttonMappingSchema = z.object({
  roleId: snowflake,
  label: z.string().min(1),
  style: z.enum(["Primary", "Secondary", "Success", "Danger"]),
  customId: z.string().min(1),
  emojiKey: z.string().optional(),
});

const autoroleMappingItemSchema = z.object({
  id: z.string().optional(),
  roleId: snowflake,
  label: z.string(),
  emojiKey: z.string().optional(),
  style: z.enum(["Primary", "Secondary", "Success", "Danger"]).optional(),
});

export const saveReactionRolesSchema = z.object({
  guildId: snowflakeOpt,
  channelId: snowflake,
  messageId: snowflake,
  mappings: z.array(reactionMappingSchema),
});

export const createAutoroleCompactSchema = z.object({
  guildId: snowflakeOpt,
  channelId: snowflake,
  type: z.enum(["BUTTONS", "SELECT", "REACTIONS"]),
  source: z.enum(["template", "existing", "plain"]),
  title: z.string().optional(),
  templateId: posInt.optional(),
  messageId: snowflakeOpt,
  plainContent: z.string().optional(),
  mappings: z.array(autoroleMappingItemSchema),
});

export const createAutoRoleLegacySchema = z.object({
  mode: z.enum(["buttons", "reactions"]),
  guildId: snowflakeOpt,
  channelId: snowflake,
  messageSource: z.enum(["existing", "create"]),
  messageId: snowflakeOpt,
  embed: embedPayloadSchema.optional(),
  reactionMappings: z.array(reactionMappingSchema).optional(),
  buttonMappings: z.array(buttonMappingSchema).optional(),
  title: z.string().optional(),
});

export const createAutoroleSchema = z.union([
  createAutoroleCompactSchema,
  createAutoRoleLegacySchema,
]);

export const updateAutoroleMappingSchema = z.object({
  mappings: z.array(autoroleMappingItemSchema),
});

export const updateAutoroleContentSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  embed: embedPayloadSchema.optional(),
});

export const saveAutoJoinRolesSchema = z.object({
  guildId: snowflakeOpt,
  humanRoles: snowflakeList,
  botRoles: snowflakeList,
});
