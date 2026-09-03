import {
  AUTO_MOD_MAX_ALLOWED_LINKS,
  AUTO_MOD_MAX_BANNED_WORDS,
  AUTO_MOD_MAX_LINK_LENGTH,
  AUTO_MOD_MAX_WORD_LENGTH,
} from "@adobos/shared";
import { z } from "zod";
import {
  nonNegInt,
  posInt,
  snowflakeList,
  snowflakeNull,
} from "../../../core/http/schemas.js";

const autoModFiltersSchema = z.object({
  zalgo: z.boolean().optional(),
  excessCaps: z.boolean().optional(),
  capsPercentage: z.number().int().min(0).max(100).optional(),
  capsMinLength: nonNegInt.optional(),
  bannedWordsEnabled: z.boolean().optional(),
  bannedWords: z
    .array(z.string().max(AUTO_MOD_MAX_WORD_LENGTH))
    .max(AUTO_MOD_MAX_BANNED_WORDS)
    .optional(),
  antiLinks: z.boolean().optional(),
  allowedLinks: z
    .array(z.string().max(AUTO_MOD_MAX_LINK_LENGTH))
    .max(AUTO_MOD_MAX_ALLOWED_LINKS)
    .optional(),
  antiInvites: z.boolean().optional(),
  messageSpam: z.boolean().optional(),
  repeatedText: z.boolean().optional(),
  mentionSpam: z.boolean().optional(),
  mentionSpamLimit: posInt.optional(),
  textFlood: z.boolean().optional(),
  floodMaxChars: posInt.optional(),
  floodMaxLines: posInt.optional(),
});

export const updateAutoModConfigSchema = z.object({
  enabled: z.boolean().optional(),
  filters: autoModFiltersSchema.optional(),
  ignoredRoles: snowflakeList.optional(),
  ignoredChannels: snowflakeList.optional(),
  logChannelId: snowflakeNull,
  warnDecayDays: z
    .union([
      z.literal(0),
      z.literal(14),
      z.literal(30),
      z.literal(60),
      z.literal(90),
    ])
    .optional(),
  warnOnHit: z.boolean().optional(),
  dmOnHit: z.boolean().optional(),
  skipStaff: z.boolean().optional(),
  punishments: z
    .array(
      z.object({
        warnThreshold: posInt,
        actionType: z.enum([
          "TIMEOUT",
          "KICK",
          "BAN",
          "REMOVE_XP",
          "XP_FREEZE",
        ]),
        actionParam: z.number().nullable(),
      }),
    )
    .max(20)
    .optional(),
});
