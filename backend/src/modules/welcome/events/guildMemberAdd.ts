import {
  AttachmentBuilder,
  type GuildMember,
} from "discord.js";
import { eq } from "drizzle-orm";
import { getDb, one } from "../../../db/client.js";
import { welcomeSettings } from "../../../db/schema.js";
import {
  disableWelcomeSettings,
  parseTextLayersJson,
} from "../service.js";
import { buildWelcomeCard } from "../card/WelcomeCardBuilder.js";
import { logger } from "../../../core/log.js";
import {
  applyWelcomeVariables,
  contextFromMember,
} from "../text/welcomeEmbed.js";
import { isWelcomeSendChannel } from "../channel.js";

/**
 * Envía la tarjeta PNG de bienvenida (canvas).
 * Errores se tragan: un canal borrado no tumba el bot.
 */
export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  try {
    if (member.user.bot) return;

    const row = await one(getDb()
      .select()
      .from(welcomeSettings)
      .where(eq(welcomeSettings.guildId, member.guild.id))
      .limit(1));

    if (!row?.isEnabled || !row.channelId) return;

    const channel = await member.guild.channels
      .fetch(row.channelId)
      .catch(() => null);

    if (!channel) {
      await disableWelcomeSettings(member.guild.id);
      logger.warn(
        `Welcome disabled in ${member.guild.id}: channel deleted.`,
      );
      return;
    }
    if (!isWelcomeSendChannel(channel)) {
      logger.warn(
        `Welcome: channel ${row.channelId} does not support text in ${member.guild.id}.`,
      );
      return;
    }

    const ctx = contextFromMember(member);
    const messageContent = row.messageContent?.trim()
      ? applyWelcomeVariables(row.messageContent, ctx, "message").slice(0, 2000)
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
      text: applyWelcomeVariables(layer.text, ctx, "card"),
    }));

    const png = await buildWelcomeCard({
      user: {
        username: member.user.username,
        displayName: member.displayName,
        avatarUrl: member.user.displayAvatarURL({
          extension: "png",
          size: 512,
          forceStatic: true,
        }),
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

    const attachment = new AttachmentBuilder(png, {
      name: "welcome-card.png",
    });

    await channel.send({
      content: messageContent || undefined,
      files: [attachment],
    });
  } catch (error: unknown) {
    logger.warn({ err: error instanceof Error ? error.message : error }, "Silent error in guildMemberAdd (welcome):");
  }
}
