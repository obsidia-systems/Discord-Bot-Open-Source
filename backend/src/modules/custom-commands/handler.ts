import {
  EmbedBuilder,
  type AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { CustomCommand } from "@adobos/shared";
import { featureLockedMessage } from "@adobos/shared";
import { can, getGuildTier } from "../../core/entitlements/service.js";
import { resolveEmbedMedia } from "../../lib/embedMedia.js";
import { getCustomCommandByName } from "./service.js";
import { parseCustomCommandVariables } from "./variables.js";

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

function checkPermissions(
  interaction: ChatInputCommandInteraction,
  command: CustomCommand,
): string | null {
  const perms = command.permissions;
  const roleIds = memberRoleIds(interaction);
  const channelId = interaction.channelId;

  if (perms.ignoredRoleIds.some((id) => roleIds.includes(id))) {
    return "No tienes permiso para usar este comando (rol ignorado).";
  }
  if (
    perms.allowedRoleIds.length > 0 &&
    !perms.allowedRoleIds.some((id) => roleIds.includes(id))
  ) {
    return "No tienes un rol permitido para usar este comando.";
  }
  if (perms.ignoredChannelIds.includes(channelId)) {
    return "Este comando no se puede usar en este canal.";
  }
  if (
    perms.allowedChannelIds.length > 0 &&
    !perms.allowedChannelIds.includes(channelId)
  ) {
    return "Este comando solo se puede usar en canales permitidos.";
  }
  return null;
}

function checkCooldown(
  interaction: ChatInputCommandInteraction,
  command: CustomCommand,
): string | null {
  const seconds = command.options.cooldownSeconds;
  if (seconds <= 0 || !interaction.guildId) return null;
  const key = cooldownKey(
    interaction.guildId,
    interaction.user.id,
    command.id,
  );
  const until = cooldownUntil.get(key) ?? 0;
  const now = Date.now();
  if (until > now) {
    const left = Math.ceil((until - now) / 1000);
    return `Espera **${left}s** antes de usar \`/${command.name}\` de nuevo.`;
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
 * Ejecuta un comando custom si existe para este guild+nombre.
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
  if (!command) return false;

  if (!(await can(interaction.guildId, "custom-commands"))) {
    const tier = await getGuildTier(interaction.guildId);
    await interaction.reply({
      content: `🔒 ${featureLockedMessage(tier, "custom-commands")}`,
      ephemeral: true,
    });
    return true;
  }

  const permError = checkPermissions(interaction, command);
  if (permError) {
    await interaction.reply({ content: permError, ephemeral: true });
    return true;
  }

  const cdError = checkCooldown(interaction, command);
  if (cdError) {
    await interaction.reply({ content: cdError, ephemeral: true });
    return true;
  }

  const stats = await resolveLevelStats(
    interaction.guildId,
    interaction.user.id,
  );
  const varCtx = {
    interaction,
    level: stats.level,
    xp: stats.xp,
  };

  const contentRaw = command.responseData.content?.trim() ?? "";
  const content = contentRaw
    ? parseCustomCommandVariables(contentRaw, varCtx)
    : undefined;

  const files: AttachmentBuilder[] = [];
  let embeds;
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
        console.warn(
          `[adobos] custom-commands: media inválida (/${command.name}):`,
          error,
        );
      }
    }
    embeds = [builder];
  }

  if (!content && !embeds) {
    await interaction.reply({
      content: "Este comando no tiene respuesta configurada.",
      ephemeral: true,
    });
    return true;
  }

  const allowedMentions = command.options.disableMentions
    ? { parse: [] as const }
    : undefined;

  const payload = {
    content: content || undefined,
    embeds,
    files: files.length > 0 ? files : undefined,
    allowedMentions,
    ephemeral: command.options.ephemeral && !command.options.dmResponse,
  };

  if (command.options.dmResponse) {
    try {
      await interaction.user.send({
        content: payload.content,
        embeds: payload.embeds,
        files: payload.files,
        allowedMentions,
      });
      await interaction.reply({
        content: "Te envié la respuesta por mensaje directo.",
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content:
          "No pude enviarte un DM. Revisa tu configuración de privacidad.",
        ephemeral: true,
      });
    }
    return true;
  }

  const reply = await interaction.reply({
    ...payload,
    fetchReply: command.options.autoDelete,
  });

  if (command.options.autoDelete && reply && "delete" in reply) {
    setTimeout(() => {
      void reply.delete().catch(() => undefined);
    }, 15_000);
  }

  return true;
}
