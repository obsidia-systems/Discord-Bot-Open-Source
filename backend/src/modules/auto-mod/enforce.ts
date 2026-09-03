import type { AutoModConfig } from "@adobos/shared";
import { AUTO_MOD_FILTER_LABELS, type AutoModFilterKey } from "@adobos/shared";
import type { Client, GuildMember, Message, User } from "discord.js";
import { logger } from "#core/log.js";
import { executeModAction } from "#modules/moderation/service.js";
import { dispatchAutoModAlert } from "./logs.js";
import { applyAutoModPunishments } from "./punishments.js";

export async function enforceAutoModHit(input: {
  client: Client;
  guildId: string;
  guildName: string;
  member: GuildMember;
  user: User;
  config: AutoModConfig;
  filterKey: AutoModFilterKey;
  content: string;
  channelId: string | null;
  messageId?: string | null;
  /** Si hay mensaje visible (capa bot). Nativo ya bloqueó: no borrar. */
  messageToDelete?: Message | null;
  nativeBlock?: boolean;
}): Promise<void> {
  const filterLabel = AUTO_MOD_FILTER_LABELS[input.filterKey];
  if (input.messageToDelete) {
    await input.messageToDelete.delete().catch(() => {});
  }

  const reason = `[AutoMod] Filter triggered: ${filterLabel}`;
  let warned = false;
  if (input.config.warnOnHit) {
    try {
      await executeModAction(input.client, {
        action: "warn",
        guildId: input.guildId,
        userId: input.user.id,
        reason,
        dmMode: input.config.dmOnHit ? "text" : "none",
        dmText: input.config.dmOnHit
          ? `Your message in the server **${input.guildName}** was blocked by Auto-Mod (Reason: ${filterLabel}).`
          : undefined,
      });
      warned = true;
    } catch (error) {
      logger.warn({ err: error }, "auto-mod: couldn't record warn:");
    }
  }

  if (warned) {
    await applyAutoModPunishments({
      client: input.client,
      guildId: input.guildId,
      member: input.member,
      config: input.config,
    }).catch((error) => {
      logger.warn({ err: error }, "auto-mod: escalated sanction failed:");
    });
  }

  await dispatchAutoModAlert(input.client, {
    guildId: input.guildId,
    channelId: input.channelId,
    user: input.user,
    filterLabel,
    content: input.content,
    messageId: input.messageId,
    nativeBlock: input.nativeBlock,
  });
}
