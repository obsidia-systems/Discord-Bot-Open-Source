import { AttachmentBuilder, type Guild, type User } from "discord.js";
import { and, eq } from "drizzle-orm";
import type { CanvasEventType } from "@adobos/shared";
import { getDb } from "../../db/client.js";
import { canvasEventSettings } from "../../db/schema.js";
import { buildWelcomeCard } from "../welcome/card/WelcomeCardBuilder.js";
import {
  applyWelcomeVariables,
  isSendableTextChannel,
  type WelcomeTemplateContext,
} from "../welcome/text/welcomeEmbed.js";
import { parseTextLayersJson } from "../welcome/service.js";
import { disableCanvasEventSettings } from "./service.js";

export interface CanvasEventUserPayload {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

function buildContext(
  guild: Guild,
  user: CanvasEventUserPayload,
): WelcomeTemplateContext {
  return {
    userMention: `<@${user.id}>`,
    username: user.username,
    displayName: user.displayName,
    serverName: guild.name,
    memberCount: guild.memberCount,
  };
}

/**
 * Lee config + genera PNG + envía al canal. Errores se tragan.
 */
export async function dispatchCanvasEventCard(options: {
  eventType: CanvasEventType;
  guild: Guild;
  user: CanvasEventUserPayload;
  logLabel: string;
}): Promise<void> {
  try {
    const { eventType, guild, user, logLabel } = options;

    const row = getDb()
      .select()
      .from(canvasEventSettings)
      .where(
        and(
          eq(canvasEventSettings.guildId, guild.id),
          eq(canvasEventSettings.eventType, eventType),
        ),
      )
      .get();

    if (!row?.isEnabled || !row.channelId) return;

    const channel = await guild.channels.fetch(row.channelId).catch(() => null);
    if (!channel || !isSendableTextChannel(channel)) {
      disableCanvasEventSettings(eventType, guild.id);
      console.warn(
        `[adobos] ${logLabel} desactivado en ${guild.id}: canal inválido o borrado.`,
      );
      return;
    }

    const ctx = buildContext(guild, user);
    const messageContent = row.messageContent?.trim()
      ? applyWelcomeVariables(row.messageContent, ctx).slice(0, 2000)
      : undefined;

    const layers = parseTextLayersJson(row.textLayers, {
      primaryText: row.primaryText,
      secondaryText: row.secondaryText,
      textX: row.textX,
      textY: row.textY,
      fontSize: row.fontSize,
      textColor: row.textColor,
    }).map((layer) => ({
      ...layer,
      text: applyWelcomeVariables(layer.text, ctx),
    }));

    const png = await buildWelcomeCard({
      user: {
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      bgFilepath: row.bgFilepath,
      backgroundUrl: row.backgroundUrl,
      blurAmount: row.blurAmount,
      avatarX: row.avatarX,
      avatarY: row.avatarY,
      avatarSize: row.avatarSize,
      avatarBorderWidth: row.avatarBorderWidth ?? 8,
      avatarBorderColor: row.avatarBorderColor ?? "#FFFFFF",
      textLayers: layers,
    });

    await channel.send({
      content: messageContent || undefined,
      files: [new AttachmentBuilder(png, { name: `${eventType}-card.png` })],
    });
  } catch (error: unknown) {
    console.warn(
      `[adobos] Error silencioso en ${options.logLabel}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export function userPayloadFromDiscordUser(
  user: User,
  displayName?: string | null,
): CanvasEventUserPayload {
  return {
    id: user.id,
    username: user.username,
    displayName: displayName?.trim() || user.globalName || user.username,
    avatarUrl: user.displayAvatarURL({
      extension: "png",
      size: 512,
      forceStatic: true,
    }),
  };
}
