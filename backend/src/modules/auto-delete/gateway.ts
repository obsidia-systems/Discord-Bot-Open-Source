import {
  AUTO_DELETE_MAX_COUNTDOWN_MS,
  delayToMs,
  findAutoDeleteRule,
  messageMatchesAutoDeleteFilter,
} from "@adobos/shared";
import type { Message } from "discord.js";
import { logger } from "#core/log.js";
import { getAutoDeleteConfigCached } from "./domain/auto-delete.js";
import { enqueueCountdownDelete } from "./pending.js";

export async function onAutoDeleteMessageCreate(
  message: Message,
): Promise<void> {
  try {
    if (!message.guild || message.system) return;
    if (!message.channel.isTextBased()) return;

    const guildId = message.guild.id;
    const config = await getAutoDeleteConfigCached(guildId);
    if (!config.enabled || config.rules.length === 0) return;

    const parentId =
      "parentId" in message.channel ? message.channel.parentId : null;
    const rule = findAutoDeleteRule(config.rules, message.channelId, parentId);
    if (!rule || rule.mode !== "COUNTDOWN") return;

    if (
      !messageMatchesAutoDeleteFilter(
        {
          pinned: message.pinned,
          authorIsBot: Boolean(message.author.bot),
          hasAttachments: message.attachments.size > 0,
          createdTimestamp: message.createdTimestamp,
        },
        rule.filterType,
      )
    ) {
      return;
    }

    const delayMs = Math.min(
      delayToMs(rule.delayValue, rule.delayUnit),
      AUTO_DELETE_MAX_COUNTDOWN_MS,
    );
    if (delayMs <= 0) return;

    await enqueueCountdownDelete({
      guildId,
      channelId: message.channelId,
      messageId: message.id,
      ruleChannelId: rule.channelId,
      deleteAt: new Date(Date.now() + delayMs),
    });
  } catch (error) {
    logger.warn({ err: error }, "auto-delete messageCreate failed:");
  }
}

export function registerAutoDeleteListeners(ctx: {
  on: <K extends keyof import("discord.js").ClientEvents>(
    event: K,
    handler: (...args: import("discord.js").ClientEvents[K]) => void,
  ) => void;
}): void {
  ctx.on("messageCreate", (message) => {
    void onAutoDeleteMessageCreate(message);
  });
}
