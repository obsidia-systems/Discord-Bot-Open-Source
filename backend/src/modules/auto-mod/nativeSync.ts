import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  DiscordAPIError,
  PermissionFlagsBits,
  type AutoModerationRule,
  type Client,
  type Guild,
} from "discord.js";
import type { AutoModConfig, AutoModFilterKey } from "@adobos/shared";
import { logger } from "../../core/log.js";
import {
  ADOBOS_NATIVE_RULE_NAMES,
  ADOBOS_NATIVE_RULE_PREFIX,
  DISCORD_EXEMPT_CHANNELS_MAX,
  DISCORD_EXEMPT_ROLES_MAX,
  discordInviteRegexPatterns,
  nativeRuleKeyFromName,
  sliceExemptIds,
  toDiscordKeywordFilter,
} from "./nativeRules.js";

export interface NativeSyncResult {
  ok: boolean;
  message: string;
}

const AUDIT = "Adobos Auto-Mod";
const BLOCK_MESSAGE =
  "Your message was blocked by Auto-Mod (Adobos).";

/**
 * Espeja palabras / invitaciones / menciones en AutoMod nativo de Discord.
 * El mensaje no llega al canal. Zalgo, caps y flood siguen en el bot.
 * No toca reglas que no empiecen por "Adobos · ".
 */
export async function syncNativeAutoMod(
  bot: Client,
  guildId: string,
  config: AutoModConfig,
): Promise<NativeSyncResult> {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) {
    return {
      ok: false,
      message: "The bot is not in that server; native AutoMod couldn't be synced.",
    };
  }

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return {
      ok: false,
      message:
        "Missing the Manage Server permission to sync native AutoMod. The bot filter is still active.",
    };
  }

  try {
    const existing = await guild.autoModerationRules.fetch();
    const ours = [...existing.values()].filter((rule) =>
      rule.name.startsWith(ADOBOS_NATIVE_RULE_PREFIX),
    );
    // Key by filter, not by raw name, so rules still carrying a pre-1c-B
    // Spanish name are adopted and get renamed in place by the upsert.
    const byKey = new Map<AutoModFilterKey, AutoModerationRule>();
    for (const rule of ours) {
      const key = nativeRuleKeyFromName(rule.name);
      if (!key) continue;
      // A rule already under the canonical English name always wins over a
      // leftover Spanish-named one for the same filter.
      const canonicalName =
        ADOBOS_NATIVE_RULE_NAMES[
          key as keyof typeof ADOBOS_NATIVE_RULE_NAMES
        ];
      if (canonicalName === rule.name || !byKey.has(key)) byKey.set(key, rule);
    }
    const exemptRoles = sliceExemptIds(
      config.ignoredRoles,
      DISCORD_EXEMPT_ROLES_MAX,
    );
    const exemptChannels = sliceExemptIds(
      config.ignoredChannels,
      DISCORD_EXEMPT_CHANNELS_MAX,
    );

    const words = toDiscordKeywordFilter(
      config.enabled && config.filters.bannedWordsEnabled
        ? config.filters.bannedWords
        : [],
    );
    await upsertKeywordRule(guild, byKey.get("bannedWords"), {
      name: ADOBOS_NATIVE_RULE_NAMES.bannedWords,
      enabled: words.length > 0,
      keywordFilter: words,
      exemptRoles,
      exemptChannels,
    });

    await upsertInviteRule(guild, byKey.get("antiInvites"), {
      enabled: Boolean(config.enabled && config.filters.antiInvites),
      exemptRoles,
      exemptChannels,
    });

    await upsertMentionRule(guild, byKey.get("mentionSpam"), {
      enabled: Boolean(config.enabled && config.filters.mentionSpam),
      mentionTotalLimit: config.filters.mentionSpamLimit,
      exemptRoles,
      exemptChannels,
    });

    return { ok: true, message: "Discord native AutoMod synced." };
  } catch (error) {
    if (error instanceof DiscordAPIError && (error.code === 50013 || error.status === 403)) {
      return {
        ok: false,
        message:
          "Discord rejected the native rules (permissions or the server's rule cap). The bot filter is still active.",
      };
    }
    logger.warn({ err: error, guildId }, "auto-mod: native sync failed:");
    return {
      ok: false,
      message:
        "Couldn't sync native AutoMod. The bot filter is still active.",
    };
  }
}

function blockAction() {
  return [
    {
      type: AutoModerationActionType.BlockMessage,
      metadata: { customMessage: BLOCK_MESSAGE },
    },
  ];
}

async function upsertKeywordRule(
  guild: Guild,
  existing: AutoModerationRule | undefined,
  input: {
    name: string;
    enabled: boolean;
    keywordFilter: string[];
    exemptRoles: string[];
    exemptChannels: string[];
  },
): Promise<void> {
  if (!input.enabled) {
    if (existing) await existing.delete(AUDIT);
    return;
  }
  const body = {
    name: input.name,
    enabled: true,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerMetadata: { keywordFilter: input.keywordFilter },
    actions: blockAction(),
    exemptRoles: input.exemptRoles,
    exemptChannels: input.exemptChannels,
    reason: AUDIT,
  };
  if (existing && existing.triggerType === AutoModerationRuleTriggerType.Keyword) {
    await existing.edit(body);
    return;
  }
  if (existing) await existing.delete(AUDIT);
  await guild.autoModerationRules.create({
    ...body,
    triggerType: AutoModerationRuleTriggerType.Keyword,
  });
}

async function upsertInviteRule(
  guild: Guild,
  existing: AutoModerationRule | undefined,
  input: {
    enabled: boolean;
    exemptRoles: string[];
    exemptChannels: string[];
  },
): Promise<void> {
  if (!input.enabled) {
    if (existing) await existing.delete(AUDIT);
    return;
  }
  const body = {
    name: ADOBOS_NATIVE_RULE_NAMES.antiInvites,
    enabled: true,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerMetadata: {
      keywordFilter: [],
      regexPatterns: discordInviteRegexPatterns(),
    },
    actions: blockAction(),
    exemptRoles: input.exemptRoles,
    exemptChannels: input.exemptChannels,
    reason: AUDIT,
  };
  if (existing && existing.triggerType === AutoModerationRuleTriggerType.Keyword) {
    await existing.edit(body);
    return;
  }
  if (existing) await existing.delete(AUDIT);
  await guild.autoModerationRules.create({
    ...body,
    triggerType: AutoModerationRuleTriggerType.Keyword,
  });
}

async function upsertMentionRule(
  guild: Guild,
  existing: AutoModerationRule | undefined,
  input: {
    enabled: boolean;
    mentionTotalLimit: number;
    exemptRoles: string[];
    exemptChannels: string[];
  },
): Promise<void> {
  if (!input.enabled) {
    if (existing) await existing.delete(AUDIT);
    return;
  }
  const limit = Math.max(1, Math.min(50, Math.round(input.mentionTotalLimit || 5)));
  const body = {
    name: ADOBOS_NATIVE_RULE_NAMES.mentionSpam,
    enabled: true,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerMetadata: {
      mentionTotalLimit: limit,
      mentionRaidProtectionEnabled: true,
    },
    actions: blockAction(),
    exemptRoles: input.exemptRoles,
    exemptChannels: input.exemptChannels,
    reason: AUDIT,
  };
  if (
    existing &&
    existing.triggerType === AutoModerationRuleTriggerType.MentionSpam
  ) {
    await existing.edit(body);
    return;
  }
  if (existing) await existing.delete(AUDIT);
  await guild.autoModerationRules.create({
    ...body,
    triggerType: AutoModerationRuleTriggerType.MentionSpam,
  });
}
