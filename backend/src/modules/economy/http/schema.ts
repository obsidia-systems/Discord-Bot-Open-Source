import { z } from "zod";
import {
  finiteNum,
  nonNegInt,
  snowflake,
  snowflakeOpt,
} from "#core/http/schemas.js";

export const updateEconomyConfigSchema = z.object({
  isActive: z.boolean().optional(),
  currencyName: z.string().min(1).max(64).optional(),
  currencySymbol: z.string().min(1).max(16).optional(),
  startBalance: nonNegInt.optional(),
  transferTax: z.number().int().min(0).max(100).optional(),
  guildId: snowflakeOpt,
});

const roleSalarySchema = z.object({
  id: z.string(),
  roleId: snowflake,
  amount: nonNegInt,
  frequency: z.enum(["daily", "weekly"]),
});

const jobSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  minPay: nonNegInt,
  maxPay: nonNegInt,
  cooldownMinutes: nonNegInt,
  successMessage: z.string(),
});

const crimeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  successChance: z.number().int().min(0).max(100),
  minReward: nonNegInt,
  maxReward: nonNegInt,
  minFine: nonNegInt,
  maxFine: nonNegInt,
  cooldownMinutes: nonNegInt,
  successMessage: z.string(),
  failMessage: z.string(),
});

export const updateEconomyIncomeSchema = z.object({
  dailyPay: nonNegInt.optional(),
  weeklyPay: nonNegInt.optional(),
  monthlyPay: nonNegInt.optional(),
  streakEnabled: z.boolean().optional(),
  streakBonusPercent: z.number().int().min(0).max(100).optional(),
  roleSalaries: z.array(roleSalarySchema).optional(),
  jobs: z.array(jobSchema).optional(),
  crimes: z.array(crimeSchema).optional(),
  rob: z
    .object({
      enabled: z.boolean(),
      successChance: z.number().int().min(0).max(100),
      cooldownMinutes: nonNegInt,
      minTargetWallet: nonNegInt,
      minStealPercent: z.number().int().min(0).max(100),
      maxStealPercent: z.number().int().min(0).max(100),
      failFinePercent: z.number().int().min(0).max(100),
    })
    .optional(),
  guildId: snowflakeOpt,
});

export const updateEconomyCasinoSchema = z.object({
  isActive: z.boolean().optional(),
  minBet: nonNegInt.optional(),
  maxBet: nonNegInt.optional(),
  coinflip: z
    .object({
      multiplier: finiteNum.optional(),
      winMessage: z.string().optional(),
      allowDoubleOrNothing: z.boolean().optional(),
      cooldownSeconds: nonNegInt.optional(),
    })
    .optional(),
  roulette: z
    .object({
      colorMultiplier: finiteNum.optional(),
      greenMultiplier: finiteNum.optional(),
      numberMultiplier: finiteNum.optional(),
      bettingTimeSeconds: nonNegInt.optional(),
      cooldownSeconds: nonNegInt.optional(),
      showNumberHistory: z.boolean().optional(),
    })
    .optional(),
  blackjack: z
    .object({
      allowDoubleDown: z.boolean().optional(),
      allowSplit: z.boolean().optional(),
      blackjackMultiplier: finiteNum.optional(),
      deckCount: z
        .union([
          z.literal(1),
          z.literal(2),
          z.literal(4),
          z.literal(6),
          z.literal(8),
        ])
        .optional(),
      standOnSoft17: z.boolean().optional(),
    })
    .optional(),
  slots: z
    .object({
      cooldownSeconds: nonNegInt.optional(),
    })
    .optional(),
  guildId: snowflakeOpt,
});

const durationUnit = z.enum(["hours", "days"]);

const shopRewardsSchema = z.object({
  hasRole: z.boolean(),
  roleConfig: z.object({
    roleId: z.string(),
    temporary: z.boolean(),
    durationValue: nonNegInt,
    durationUnit,
  }),
  hasChannel: z.boolean(),
  channelConfig: z.object({
    nameTemplate: z.string(),
    categoryId: z.string().nullable(),
    temporary: z.boolean(),
    durationValue: nonNegInt,
    durationUnit,
  }),
  hasBoost: z.boolean(),
  boostConfig: z.object({
    module: z.enum(["xp", "economy"]),
    multiplier: finiteNum,
    temporary: z.boolean(),
    durationValue: nonNegInt,
    durationUnit,
  }),
  hasManual: z.boolean(),
  manualConfig: z.object({
    staffInstructions: z.string(),
    logChannelId: z.string(),
    pingRoleId: z.string(),
  }),
});

export const createShopItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  price: nonNegInt,
  icon: z.string().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  rewards: shopRewardsSchema,
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  guildId: snowflakeOpt,
});

export const updateShopItemSchema = createShopItemSchema.partial();

export const adjustEconomyFundsSchema = z.object({
  userId: snowflake,
  target: z.enum(["wallet", "bank"]),
  action: z.enum(["add", "remove", "set"]),
  amount: z.number().int().min(0),
  guildId: snowflakeOpt,
});
