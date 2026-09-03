import type { CustomCommand } from "@adobos/shared";
import {
  customCommandAllowedMentions,
  customCommandPermissionDenial,
  customCommandTemplatePingsInvoker,
  customCommandTemplatePingsTarget,
  featureLockedMessage,
} from "@adobos/shared";
import {
  type AttachmentBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { can, getGuildTier } from "#core/entitlements/service.js";
import { logger } from "#core/log.js";
import { resolveEmbedMedia } from "#lib/embedMedia.js";
import { getCustomCommandByName } from "./service.js";
import { parseCustomCommandVariables } from "./variables.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

/** Cooldown en memoria: guildId:userId:commandId → timestamp ms. */
const cooldownUntil = new Map<string, number>();

function cooldownKey(
  guildId: string,
  userId: string,
  commandId: number,
): string {
  return `${guildId}:${userId}:${commandId}`;
}

function embedColorInt(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x5865f2;
}

function memberRoleIds(interaction: ChatInputCommandInteraction): string[] {
  const member = interaction.member;
  if (!member || !("roles" in member)) return [];
  const roles = member.roles;
  if (roles && typeof roles === "object" && "cache" in roles) {
    return [...roles.cache.keys()];
  }
  if (Array.isArray(roles)) return roles.map(String);
  return [];
}

function checkCooldown(
  interaction: ChatInputCommandInteraction,
  command: CustomCommand,
): string | null {
  const seconds = command.options.cooldownSeconds;
  if (seconds <= 0 || !interaction.guildId) return null;
  const key = cooldownKey(interaction.guildId, interaction.user.id, command.id);
  const until = cooldownUntil.get(key) ?? 0;
  const now = Date.now();
  if (until > now) {
    const left = Math.ceil((until - now) / 1000);
    return `Wait **${left}s** before using \`/${command.name}\` again.`;
  }
  cooldownUntil.set(key, now + seconds * 1000);
  return null;
}

async function resolveLevelStats(
  guildId: string,
  userId: string,
): Promise<{ level: number | null; xp: number | null }> {
  try {
    const { getUserRankStats } = await import("../levels/service.js");
    const stats = await getUserRankStats(guildId, userId);
    return { level: stats?.level ?? null, xp: stats?.xp ?? null };
  } catch {
    return { level: null, xp: null };
  }
}

/**
 * Ejecuta un Custom Command si existe para este guild+nombre.
 * @returns true si se manejó la interacción.
 */
export async function handleCustomChatCommand(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (!interaction.guildId) return false;

  const command = await getCustomCommandByName(
    interaction.guildId,
    interaction.commandName,
  );
  if (!command?.isActive) return false;

  if (!(await can(interaction.guildId, "custom-commands"))) {
    const tier = await getGuildTier(interaction.guildId);
    await interaction.reply({
      content: `🔒 ${featureLockedMessage(tier, "custom-commands")}`,
      ...EPHEMERAL,
    });
    return true;
  }

  const permError = customCommandPermissionDenial(
    command.permissions,
    memberRoleIds(interaction),
    interaction.channelId,
  );
  if (permError) {
    await interaction.reply({ content: permError, ...EPHEMERAL });
    return true;
  }

  const cdError = checkCooldown(interaction, command);
  if (cdError) {
    await interaction.reply({ content: cdError, ...EPHEMERAL });
    return true;
  }

  const stats = await resolveLevelStats(
    interaction.guildId,
    interaction.user.id,
  );
  const text = command.options.acceptText
    ? (interaction.options.getString("text") ?? "")
    : "";
  const target = command.options.acceptUser
    ? interaction.options.getUser("user")
    : null;

  const rawBlob = [
    command.responseData.content,
    command.responseData.embed?.title ?? "",
    command.responseData.embed?.description ?? "",
  ].join("\n");

  const varCtx = {
    interaction,
    level: stats.level,
    xp: stats.xp,
    text,
    target,
    allowEveryone: command.options.allowEveryone,
  };

  const contentRaw = command.responseData.content?.trim() ?? "";
  const content = contentRaw
    ? parseCustomCommandVariables(contentRaw, varCtx)
    : undefined;

  const files: AttachmentBuilder[] = [];
  let embeds: EmbedBuilder[] | undefined;
  if (command.responseData.embed) {
    const emb = command.responseData.embed;
    const builder = new EmbedBuilder()
      .setColor(embedColorInt(emb.color))
      .setTitle(
        parseCustomCommandVariables(emb.title || "\u200b", varCtx).slice(
          0,
          256,
        ),
      )
      .setDescription(
        parseCustomCommandVariables(emb.description || "\u200b", varCtx).slice(
          0,
          4096,
        ),
      );
    if (emb.imageUrl) {
      try {
        const resolved = resolveEmbedMedia(
          emb.imageUrl,
          "imageUrl",
          "custom-cmd-image",
        );
        if (resolved.file) files.push(resolved.file);
        if (resolved.url) builder.setImage(resolved.url);
      } catch (error) {
        logger.warn(
          { err: error },
          `custom-commands: invalid media (/${command.name})`,
        );
      }
    }
    embeds = [builder];
  }

  if (!content && !embeds) {
    await interaction.reply({
      content: "This command has no configured response.",
      ...EPHEMERAL,
    });
    return true;
  }

  const pingUserIds: string[] = [];
  if (customCommandTemplatePingsInvoker(rawBlob)) {
    pingUserIds.push(interaction.user.id);
  }
  if (target && customCommandTemplatePingsTarget(rawBlob)) {
    pingUserIds.push(target.id);
  }
  const allowedMentions = customCommandAllowedMentions({
    disableMentions: command.options.disableMentions,
    allowEveryone: command.options.allowEveryone,
    pingUserIds,
  });

  const payload = {
    content: content || undefined,
    embeds,
    files: files.length > 0 ? files : undefined,
    allowedMentions,
  };

  if (command.options.dmResponse) {
    try {
      await interaction.user.send(payload);
      await interaction.reply({
        content: "I sent you the response as a direct message.",
        ...EPHEMERAL,
      });
    } catch {
      await interaction.reply({
        content: "I couldn't send you a DM. Check your privacy settings.",
        ...EPHEMERAL,
      });
    }
    return true;
  }

  const reply = await interaction.reply({
    ...payload,
    flags:
      command.options.ephemeral && !command.options.dmResponse
        ? MessageFlags.Ephemeral
        : undefined,
    fetchReply: command.options.autoDelete,
  });

  if (command.options.autoDelete && reply && "delete" in reply) {
    setTimeout(() => {
      void reply.delete().catch(() => undefined);
    }, 15_000);
  }

  return true;
}
