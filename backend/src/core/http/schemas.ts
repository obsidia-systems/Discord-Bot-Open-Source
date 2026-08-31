import { z } from "zod";
import { CUSTOM_COMMAND_NAME_REGEX, POKEMON_GENERATIONS } from "@adobos/shared";
import { SNOWFLAKE_RE } from "./snowflake.js";

export const snowflake = z.string().regex(SNOWFLAKE_RE, "snowflake inválido");
export const snowflakeOpt = snowflake.optional();
export const snowflakeNull = z.union([snowflake, z.null()]).optional();
export const snowflakeList = z.array(snowflake);

export const recordId = z.coerce.number().int().positive();
export const stringId = z.string().min(1);

/** preprocess de zod infiere output `unknown`; este wrapper conserva T. */
function pre<T>(
  fn: (value: unknown) => unknown,
  schema: z.ZodType<T>,
): z.ZodType<T> {
  return z.preprocess(fn, schema) as z.ZodType<T>;
}

export const boolish: z.ZodType<boolean> = pre((value) => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}, z.boolean());

const hexColor = z.string().max(32);
const nonNegInt = z.number().int().min(0);
const posInt = z.number().int().positive();
const finiteNum = z.number().finite();

const weekday = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const embedPayloadSchema = z.object({
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
});

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

function emptyToUndef(value: unknown): unknown {
  if (value === "" || value === null) return undefined;
  return value;
}

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

/** Editar un embed ya enviado: channelId opcional (se reusa el original). */
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

const textLayerSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: finiteNum,
  y: finiteNum,
  fontSize: finiteNum,
  color: z.string(),
  weight: z.enum(["normal", "bold"]),
});

export const saveWelcomeSettingsSchema = z.object({
  guildId: snowflakeOpt,
  channelId: snowflakeNull,
  isEnabled: z.boolean(),
  backgroundUrl: z.string().optional(),
  bgFilepath: z.string().nullable().optional(),
  blurAmount: finiteNum,
  messageContent: z.string().optional(),
  avatarX: finiteNum,
  avatarY: finiteNum,
  avatarSize: finiteNum,
  avatarBorderWidth: finiteNum,
  avatarBorderColor: z.string(),
  textLayers: z.array(textLayerSchema),
});

export const saveCanvasEventSettingsSchema = saveWelcomeSettingsSchema;

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
      showNumberHistory: z.boolean().optional(),
    })
    .optional(),
  blackjack: z
    .object({
      allowDoubleDown: z.boolean().optional(),
      blackjackMultiplier: finiteNum.optional(),
      deckCount: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(4),
        z.literal(6),
        z.literal(8),
      ]).optional(),
      standOnSoft17: z.boolean().optional(),
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

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().max(100).optional(),
});

export const fetchMessageQuerySchema = z.object({
  channelId: snowflake,
  messageId: snowflake,
});

export const discordAuditQuerySchema = z.object({
  userId: snowflake.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  actionType: z.coerce.number().int().optional(),
});

export const modActionSchema = z.object({
  action: z.enum([
    "ban",
    "kick",
    "timeout",
    "untimeout",
    "warn",
    "unban",
    "purge",
    "slowmode",
  ]),
  guildId: snowflakeOpt,
  userId: snowflakeOpt,
  channelId: snowflakeOpt,
  reason: z.string().max(512),
  durationSeconds: nonNegInt.optional(),
  deleteMessageDays: z.number().int().min(0).max(7).optional(),
  purgeLimit: z.number().int().min(1).max(100).optional(),
  slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
  dmMode: z.enum(["none", "text", "template"]).optional(),
  dmText: z.string().max(2000).optional(),
  templateId: posInt.optional(),
});

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

export const updateSystemCommandsSchema = z.object({
  commands: z.array(
    z.object({
      commandName: z.string().min(1).max(32),
      enabled: z.boolean(),
      allowedRoles: snowflakeList,
      ignoredChannels: snowflakeList,
      ephemeral: z.boolean(),
    }),
  ),
});

const autoModFiltersSchema = z.object({
  zalgo: z.boolean().optional(),
  excessCaps: z.boolean().optional(),
  capsPercentage: z.number().int().min(0).max(100).optional(),
  capsMinLength: nonNegInt.optional(),
  bannedWordsEnabled: z.boolean().optional(),
  bannedWords: z.array(z.string()).optional(),
  antiLinks: z.boolean().optional(),
  allowedLinks: z.array(z.string()).optional(),
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
  warnDecayDays: z.union([
    z.literal(0),
    z.literal(14),
    z.literal(30),
    z.literal(60),
    z.literal(90),
  ]).optional(),
  punishments: z
    .array(
      z.object({
        warnThreshold: posInt,
        actionType: z.enum(["TIMEOUT", "KICK", "BAN", "REMOVE_XP", "XP_FREEZE"]),
        actionParam: z.number().nullable(),
      }),
    )
    .optional(),
});

const autoDeleteRuleSchema = z.object({
  channelId: snowflake,
  mode: z.enum(["COUNTDOWN", "SCHEDULED"]),
  delayValue: nonNegInt,
  delayUnit: z.enum(["seconds", "minutes", "hours"]),
  scheduledTime: z.string(),
  scheduledDays: z.array(weekday),
  filterType: z.enum(["all", "bots_only", "no_attachments"]),
});

export const updateAutoDeleteConfigSchema = z.object({
  enabled: z.boolean().optional(),
  rules: z.array(autoDeleteRuleSchema).optional(),
});

const channelsMappingSchema = z.object({
  messages: snowflake.nullable().optional(),
  members: snowflake.nullable().optional(),
  roles: snowflake.nullable().optional(),
  channels: snowflake.nullable().optional(),
  voice: snowflake.nullable().optional(),
  assets: snowflake.nullable().optional(),
});

export const updateActionLogsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  routingMode: z.enum(["SIMPLE", "ADVANCED", "GLOBAL", "CATEGORY"]).optional(),
  globalChannelId: snowflakeNull,
  channelsMapping: channelsMappingSchema.optional(),
  channelsMap: channelsMappingSchema.optional(),
  ignoredChannels: snowflakeList.optional(),
  ignoredRoles: snowflakeList.optional(),
  ignoreBots: z.boolean().optional(),
  enabledEvents: z.record(z.string(), z.boolean()).optional(),
  dataRetentionDays: z
    .union([
      z.literal(0),
      z.literal(7),
      z.literal(14),
      z.literal(30),
      z.literal(90),
      z.literal(365),
    ])
    .optional(),
});

export const actionLogsHistoryQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const scheduledFrequencySchema = z.object({
  type: z.enum(["daily", "weekly", "monthly", "specific_date"]),
  time: z.string().min(1),
  days: z.array(weekday),
  dayOfMonth: z.number().int().min(1).max(31),
  date: z.string(),
  repeatYearly: z.boolean(),
});

const scheduledEmbedSchema = z.object({
  title: z.string(),
  description: z.string(),
  color: z.string(),
  imageUrl: z.string().nullable(),
});

export const createScheduledMessageSchema = z.object({
  channelId: snowflake,
  timezone: z.string().min(1).max(64),
  frequency: scheduledFrequencySchema,
  embedData: scheduledEmbedSchema,
  isActive: z.boolean().optional(),
});

export const updateScheduledMessageSchema = createScheduledMessageSchema.partial();

export const toggleScheduledSchema = z.object({
  isActive: boolish,
});

const pokemonCommandName = z.enum([
  "pokeinfo",
  "teambuilder",
  "weakness",
  "breeding",
  "location",
  "counters",
  "sandwich",
]);

export const updatePokemonConfigSchema = z.object({
  isActive: z.boolean().optional(),
  defaultGeneration: z
    .number()
    .int()
    .refine((n) => (POKEMON_GENERATIONS as readonly number[]).includes(n))
    .optional(),
  language: z.enum(["es", "en"]).optional(),
  embedColor: hexColor.optional(),
  forceEphemeral: z.boolean().optional(),
  allowedChannels: snowflakeList.optional(),
  allowedRoles: snowflakeList.optional(),
  commands: z.record(pokemonCommandName, z.boolean()).optional(),
  guildId: snowflakeOpt,
});

export const updateBotGuildProfileSchema = z.object({
  nickname: z.string().max(32).nullable().optional(),
  clearNickname: boolish.optional(),
  serverAvatarUrl: z.string().nullable().optional(),
  clearServerAvatar: boolish.optional(),
});

export const createGuildRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
});

export const updateRolePositionsSchema = z.object({
  positions: z.array(
    z.object({
      roleId: snowflake,
      position: z.number().int(),
    }),
  ),
});

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
