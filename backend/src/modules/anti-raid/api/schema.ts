import {
  ANTI_RAID_AGE_DAYS_MAX,
  ANTI_RAID_AGE_DAYS_MIN,
  ANTI_RAID_JOIN_COUNT_MAX,
  ANTI_RAID_JOIN_COUNT_MIN,
  ANTI_RAID_NUKE_THRESHOLD_MAX,
  ANTI_RAID_NUKE_THRESHOLD_MIN,
  ANTI_RAID_TIMEOUT_MAX,
  ANTI_RAID_TIMEOUT_MIN,
  ANTI_RAID_WHITELIST_MAX,
  ANTI_RAID_WINDOW_MAX,
  ANTI_RAID_WINDOW_MIN,
  NUKE_ACTIONS,
  NUKE_PUNISHMENTS,
  RAID_AGE_ACTIONS,
  RAID_JOIN_ACTIONS,
  RAID_LOCKDOWN_JOIN_ACTIONS,
} from "@adobos/shared";
import { z } from "zod";
import {
  boolish,
  pre,
  snowflakeList,
  snowflakeNull,
} from "../../../core/http/schemas.js";

const nukeThresholdsSchema = z
  .object(
    Object.fromEntries(
      NUKE_ACTIONS.map((key) => [
        key,
        z
          .number()
          .int()
          .min(ANTI_RAID_NUKE_THRESHOLD_MIN)
          .max(ANTI_RAID_NUKE_THRESHOLD_MAX),
      ]),
    ) as {
      [K in (typeof NUKE_ACTIONS)[number]]: z.ZodNumber;
    },
  )
  .partial();

export const updateAntiRaidSettingsSchema = z.object({
  enabled: boolish.optional(),
  alertChannelId: pre((value) => (value === "" ? null : value), snowflakeNull),
  joinFloodEnabled: boolish.optional(),
  joinCount: z
    .number()
    .int()
    .min(ANTI_RAID_JOIN_COUNT_MIN)
    .max(ANTI_RAID_JOIN_COUNT_MAX)
    .optional(),
  joinWindowSeconds: z
    .number()
    .int()
    .min(ANTI_RAID_WINDOW_MIN)
    .max(ANTI_RAID_WINDOW_MAX)
    .optional(),
  joinAction: z.enum(RAID_JOIN_ACTIONS).optional(),
  accountAgeEnabled: boolish.optional(),
  accountAgeDays: z
    .number()
    .int()
    .min(ANTI_RAID_AGE_DAYS_MIN)
    .max(ANTI_RAID_AGE_DAYS_MAX)
    .optional(),
  accountAgeAction: z.enum(RAID_AGE_ACTIONS).optional(),
  lockdownJoinAction: z.enum(RAID_LOCKDOWN_JOIN_ACTIONS).optional(),
  timeoutSeconds: z
    .number()
    .int()
    .min(ANTI_RAID_TIMEOUT_MIN)
    .max(ANTI_RAID_TIMEOUT_MAX)
    .optional(),
  whitelistRoleIds: snowflakeList.max(ANTI_RAID_WHITELIST_MAX).optional(),
  nukeEnabled: boolish.optional(),
  nukeWindowSeconds: z
    .number()
    .int()
    .min(ANTI_RAID_WINDOW_MIN)
    .max(ANTI_RAID_WINDOW_MAX)
    .optional(),
  nukePunishment: z.enum(NUKE_PUNISHMENTS).optional(),
  nukeThresholds: nukeThresholdsSchema.optional(),
  nukeWhitelistUserIds: snowflakeList.max(ANTI_RAID_WHITELIST_MAX).optional(),
  nukeWhitelistRoleIds: snowflakeList.max(ANTI_RAID_WHITELIST_MAX).optional(),
});

export const lockdownBodySchema = z.object({
  active: boolish,
});
