import {
  DiscordAPIError,
  type Client,
  type EmbedBuilder,
  type GuildTextBasedChannel,
  type Webhook,
} from "discord.js";
import { eq } from "drizzle-orm";
import type { ActionLogWebhooksMapping } from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { actionLogsConfig } from "../../db/schema.js";

export const ACTION_LOG_WEBHOOK_NAME = "Adobos Audit Log";

function parseMapping(raw: string | undefined | null): ActionLogWebhooksMapping {
  try {
    return JSON.parse(raw ?? "{}") as ActionLogWebhooksMapping;
  } catch {
    return {};
  }
}

function readWebhooksMapping(guildId: string): ActionLogWebhooksMapping {
  const row = getDb()
    .select({ webhooksMapping: actionLogsConfig.webhooksMapping })
    .from(actionLogsConfig)
    .where(eq(actionLogsConfig.guildId, guildId))
    .get();
  return parseMapping(row?.webhooksMapping);
}

function writeWebhooksMapping(
  guildId: string,
  mapping: ActionLogWebhooksMapping,
): void {
  getDb()
    .update(actionLogsConfig)
    .set({
      webhooksMapping: JSON.stringify(mapping),
      updatedAt: new Date(),
    })
    .where(eq(actionLogsConfig.guildId, guildId))
    .run();
}

function forgetWebhook(guildId: string, channelId: string): void {
  const mapping = readWebhooksMapping(guildId);
  if (!(channelId in mapping)) return;
  delete mapping[channelId];
  writeWebhooksMapping(guildId, mapping);
}

function rememberWebhook(
  guildId: string,
  channelId: string,
  webhookId: string,
): void {
  const mapping = readWebhooksMapping(guildId);
  if (mapping[channelId] === webhookId) return;
  mapping[channelId] = webhookId;
  writeWebhooksMapping(guildId, mapping);
}

function isUnknownWebhook(error: unknown): boolean {
  return (
    error instanceof DiscordAPIError &&
    (error.code === 10015 || error.status === 404)
  );
}

async function resolveOrCreateWebhook(
  channel: GuildTextBasedChannel & {
    fetchWebhooks: () => Promise<Map<string, Webhook>>;
    createWebhook: (options: {
      name: string;
      reason?: string;
    }) => Promise<Webhook>;
  },
  guildId: string,
): Promise<Webhook> {
  const mapping = readWebhooksMapping(guildId);
  const cachedId = mapping[channel.id];

  const hooks = await channel.fetchWebhooks();
  if (cachedId) {
    const cached = hooks.get(cachedId);
    if (cached) return cached;
    forgetWebhook(guildId, channel.id);
  }

  const existing = [...hooks.values()].find(
    (hook) => hook.name === ACTION_LOG_WEBHOOK_NAME && hook.token,
  );
  if (existing) {
    rememberWebhook(guildId, channel.id, existing.id);
    return existing;
  }

  const created = await channel.createWebhook({
    name: ACTION_LOG_WEBHOOK_NAME,
    reason: "Adobos Action Logs — envío vía webhook",
  });
  rememberWebhook(guildId, channel.id, created.id);
  return created;
}

export interface SendActionLogWebhookInput {
  guildId: string;
  channelId: string;
  embeds: EmbedBuilder[];
  username?: string | null;
  avatarURL?: string | null;
}

/**
 * Envía embeds por webhook del canal (crea "Adobos Audit Log" si falta).
 * Si Discord borró el webhook (10015), limpia cache y reintenta una vez.
 */
export async function sendActionLogWebhook(
  bot: Client,
  input: SendActionLogWebhookInput,
): Promise<{ messageId: string }> {
  const channel = await bot.channels.fetch(input.channelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error("Canal de logs no válido para webhooks.");
  }
  if (
    !("fetchWebhooks" in channel) ||
    typeof channel.fetchWebhooks !== "function"
  ) {
    throw new Error("Este canal no soporta webhooks.");
  }

  const textChannel = channel as GuildTextBasedChannel & {
    fetchWebhooks: () => Promise<Map<string, Webhook>>;
    createWebhook: (options: {
      name: string;
      reason?: string;
    }) => Promise<Webhook>;
  };

  const payload = {
    embeds: input.embeds,
    username: input.username?.slice(0, 80) || undefined,
    avatarURL: input.avatarURL || undefined,
    allowedMentions: { parse: [] as const },
  };

  let webhook = await resolveOrCreateWebhook(textChannel, input.guildId);

  try {
    const message = await webhook.send(payload);
    return { messageId: message.id };
  } catch (error) {
    if (!isUnknownWebhook(error)) throw error;

    forgetWebhook(input.guildId, input.channelId);
    webhook = await resolveOrCreateWebhook(textChannel, input.guildId);
    const message = await webhook.send(payload);
    return { messageId: message.id };
  }
}
