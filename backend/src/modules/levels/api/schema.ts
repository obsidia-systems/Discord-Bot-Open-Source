import { z } from "zod";
import {
  finiteNum,
  nonNegInt,
  posInt,
  snowflake,
  snowflakeList,
  snowflakeNull,
} from "../../../core/http/schemas.js";

const levelsRewardSchema = z.object({
  id: z.number().int().positive().optional(),
  level: posInt,
  roleId: snowflake,
});

const roleMultiplierSchema = z.object({
  roleId: snowflake,
  multiplier: finiteNum,
});

const channelMultiplierSchema = z.object({
  channelId: snowflake,
  multiplier: finiteNum,
});

export const updateLevelsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  textXpMin: nonNegInt.optional(),
  textXpMax: nonNegInt.optional(),
  cooldownSeconds: nonNegInt.optional(),
  voiceEnabled: z.boolean().optional(),
  voiceXpPerMinute: nonNegInt.optional(),
  streamMultiplier: finiteNum.optional(),
  xpMultiplier: finiteNum.optional(),
  customMultipliers: z.array(roleMultiplierSchema).optional(),
  customChannelMultipliers: z.array(channelMultiplierSchema).optional(),
  ignoredRoles: snowflakeList.optional(),
  ignoredChannels: snowflakeList.optional(),
  levelUpChannelId: snowflakeNull,
  levelUpFormat: z.enum(["TEXT", "EMBED", "IMAGE"]).optional(),
  levelUpMessage: z.string().optional(),
  levelUpEmbedTitle: z.string().optional(),
  levelUpEmbedColor: z.string().optional(),
  levelUpShowThumbnail: z.boolean().optional(),
  levelUpImage: z.string().nullable().optional(),
  liveLeaderboardChannelId: snowflakeNull,
  leaderboardEmbedTitle: z.string().optional(),
  leaderboardEmbedDescription: z.string().optional(),
  leaderboardEmbedColor: z.string().optional(),
  leaderboardShowThumbnail: z.boolean().optional(),
  rewards: z.array(levelsRewardSchema).optional(),
});
