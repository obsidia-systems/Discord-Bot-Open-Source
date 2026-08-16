import type { Message } from "discord.js";
import { delayToMs } from "@adobos/shared";
import { getAutoDeleteConfigCached } from "./service.js";

export async function onAutoDeleteMessageCreate(
  message: Message,
): Promise<void> {
  try {
    if (!message.guild || message.system) return;
    if (!message.channel.isTextBased()) return;
    if (message.pinned) return;

    const guildId = message.guild.id;
    const config = getAutoDeleteConfigCached(guildId);
    if (!config.enabled || config.rules.length === 0) return;

    const rule = config.rules.find((r) => r.channelId === message.channelId);
    if (!rule) return;

    if (rule.filterType === "bots_only" && !message.author.bot) return;
    if (
      rule.filterType === "no_attachments" &&
      message.attachments.size > 0
    ) {
      return;
    }

    const delayMs = delayToMs(rule.delayValue, rule.delayUnit);
    if (delayMs <= 0) return;

    setTimeout(() => {
      void message.delete().catch(() => {});
    }, delayMs);
  } catch (error) {
    console.warn("[adobos] auto-delete messageCreate falló:", error);
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
