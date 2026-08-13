import {
  ChannelType,
  EmbedBuilder,
  type AttachmentBuilder,
  type Guild,
  type GuildTextBasedChannel,
} from "discord.js";
import type { EmbedPayload } from "@adobos/shared";
import {
  requireHttpUrl,
  resolveEmbedMedia,
} from "../../lib/embedMedia.js";

export interface SanctionDmContext {
  userMention: string;
  username: string;
  displayName: string;
  serverName: string;
  reason: string;
  moderator: string;
  action: string;
  inviteUrl?: string;
}

/** Interpola variables en un JSON de embed de forma segura. */
export function interpolateEmbedPayload(
  payload: EmbedPayload,
  vars: SanctionDmContext,
): EmbedPayload {
  const map: Record<string, string> = {
    "{user}": vars.userMention,
    "{username}": vars.username,
    "{displayname}": vars.displayName,
    "{displayName}": vars.displayName,
    "{server}": vars.serverName,
    "{reason}": vars.reason,
    "{moderator}": vars.moderator,
    "{action}": vars.action,
    "{invite}": vars.inviteUrl ?? "",
  };

  let raw = JSON.stringify(payload);
  for (const [token, value] of Object.entries(map)) {
    raw = raw.split(token).join(value);
  }
  return JSON.parse(raw) as EmbedPayload;
}

export function applySanctionTextVars(
  text: string,
  vars: SanctionDmContext,
): string {
  return text
    .replaceAll("{user}", vars.userMention)
    .replaceAll("{username}", vars.username)
    .replaceAll("{displayname}", vars.displayName)
    .replaceAll("{displayName}", vars.displayName)
    .replaceAll("{server}", vars.serverName)
    .replaceAll("{reason}", vars.reason)
    .replaceAll("{moderator}", vars.moderator)
    .replaceAll("{action}", vars.action)
    .replaceAll("{invite}", vars.inviteUrl ?? "");
}

function parseHexColor(color?: string): number | undefined {
  if (!color?.trim()) return undefined;
  const raw = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  return Number.parseInt(raw, 16);
}

/** Construye EmbedBuilder (+ adjuntos locales) desde EmbedPayload. */
export function buildEmbedFromPayload(embed: EmbedPayload): {
  builder: EmbedBuilder | null;
  files: AttachmentBuilder[];
  content?: string;
} {
  const files: AttachmentBuilder[] = [];
  const content = embed.content?.trim() || undefined;
  const title = embed.title?.trim() || undefined;
  const description = embed.description?.trim() || undefined;
  const authorName = embed.authorName?.trim() || undefined;
  const footerText = embed.footerText?.trim() || undefined;

  let url: string | undefined;
  try {
    url = requireHttpUrl(embed.url, "url");
  } catch {
    url = undefined;
  }

  const resolve = (value: string | undefined, field: string, name: string) => {
    try {
      const resolved = resolveEmbedMedia(value, field, name);
      if (resolved.file) files.push(resolved.file);
      return resolved.url;
    } catch {
      return undefined;
    }
  };

  const authorIconUrl = resolve(embed.authorIconUrl, "authorIconUrl", "author-icon");
  const thumbnailUrl = resolve(embed.thumbnailUrl, "thumbnailUrl", "thumbnail");
  const imageUrl = resolve(embed.imageUrl, "imageUrl", "image");
  const footerIconUrl = resolve(embed.footerIconUrl, "footerIconUrl", "footer-icon");
  const color = parseHexColor(embed.color);

  const hasBody = Boolean(
    title ||
      description ||
      authorName ||
      footerText ||
      thumbnailUrl ||
      imageUrl ||
      url,
  );
  if (!hasBody) return { builder: null, files, content };

  const builder = new EmbedBuilder();
  if (title) builder.setTitle(title);
  if (url) builder.setURL(url);
  if (description) builder.setDescription(description);
  if (color !== undefined) builder.setColor(color);
  if (authorName) builder.setAuthor({ name: authorName, iconURL: authorIconUrl });
  if (thumbnailUrl) builder.setThumbnail(thumbnailUrl);
  if (imageUrl) builder.setImage(imageUrl);
  if (footerText) builder.setFooter({ text: footerText, iconURL: footerIconUrl });
  if (embed.timestamp) builder.setTimestamp(new Date());

  return { builder, files, content };
}

/** Invite de un solo uso (24h) desde el primer canal de texto usable. */
export async function createOneUseInvite(
  guild: Guild,
): Promise<string | null> {
  const channel = guild.channels.cache.find(
    (entry) =>
      (entry.type === ChannelType.GuildText ||
        entry.type === ChannelType.GuildAnnouncement) &&
      entry.viewable,
  ) as GuildTextBasedChannel | undefined;

  if (!channel || !("createInvite" in channel)) return null;

  try {
    const invite = await channel.createInvite({
      maxUses: 1,
      maxAge: 86_400,
      unique: true,
      reason: "Invite de reingreso tras kick (panel Adobos)",
    });
    return invite.url;
  } catch {
    return null;
  }
}
