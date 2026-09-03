import type { Message } from "discord.js";
import {
  applyAutoReplyTokens,
  isAutoReplyOnCooldown,
  pickMatchingAutoReply,
} from "@adobos/shared";
import { logger } from "../../core/log.js";
import { listAutoRepliesCached } from "./service.js";

const lastFired = new Map<string, number>();
const LAST_FIRED_MAX = 8_000;

function cooldownKey(guildId: string, replyId: number, userId: string): string {
  return `${guildId}:${replyId}:${userId}`;
}

function pruneLastFired(now: number): void {
  if (lastFired.size < LAST_FIRED_MAX) return;
  for (const [key, at] of lastFired) {
    if (now - at > 3_600_000) lastFired.delete(key);
  }
  if (lastFired.size < LAST_FIRED_MAX) return;
  const overflow = lastFired.size - LAST_FIRED_MAX + 500;
  let dropped = 0;
  for (const key of lastFired.keys()) {
    lastFired.delete(key);
    dropped += 1;
    if (dropped >= overflow) break;
  }
}

export async function onAutoReplyMessageCreate(message: Message): Promise<void> {
  try {
    await handleAutoReply(message);
  } catch (error: unknown) {
    logger.warn({ err: error }, "auto-replies messageCreate failed:");
  }
}

async function handleAutoReply(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (message.system || message.webhookId) return;
  if (!message.channel.isTextBased()) return;
  const content = message.content?.trim() ?? "";
  if (!content) return;

  const replies = await listAutoRepliesCached(message.guild.id);
  if (replies.length === 0) return;

  const match = pickMatchingAutoReply(replies, content, message.channelId);
  if (!match) return;

  const now = Date.now();
  const key = cooldownKey(message.guild.id, match.id, message.author.id);
  if (isAutoReplyOnCooldown(lastFired.get(key) ?? null, match.cooldownSeconds, now)) {
    return;
  }

  const body = applyAutoReplyTokens(match.response, {
    user: `<@${message.author.id}>`,
    username: message.member?.displayName ?? message.author.username,
    server: message.guild.name,
    channel:
      "name" in message.channel && message.channel.name
        ? message.channel.name
        : message.channelId,
  }).trim();
  if (!body) return;

  const pingUser = match.response.includes("{user}");
  const payload = {
    content: body,
    allowedMentions: {
      parse: [] as [],
      users: pingUser ? [message.author.id] : [],
      roles: [] as [],
    },
  };

  if (match.useReply) {
    await message.reply(payload);
  } else if ("send" in message.channel) {
    await message.channel.send(payload);
  } else {
    return;
  }

  lastFired.set(key, now);
  pruneLastFired(now);
}
