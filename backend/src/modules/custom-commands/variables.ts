import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  User,
} from "discord.js";
import { applyCustomCommandTokens } from "@adobos/shared";

export type VariableResolveContext = {
  interaction: ChatInputCommandInteraction;
  /** Stats opcionales del módulo de niveles. */
  level?: number | null;
  xp?: number | null;
  text?: string;
  target?: User | null;
  allowEveryone?: boolean;
};

function formatDate(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString("es-MX", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Reloj civil en UTC (no la TZ del VPS). */
export function utcClockParts(at: Date = new Date()): {
  time: string;
  time12: string;
  date: string;
  datetime: string;
  datetime12: string;
} {
  const h24n = at.getUTCHours();
  const h24 = pad2(h24n);
  const m = pad2(at.getUTCMinutes());
  const time = `${h24}:${m}`;
  const h12raw = h24n % 12 || 12;
  const ampm = h24n >= 12 ? "PM" : "AM";
  const time12 = `${h12raw}:${m} ${ampm}`;
  const date = `${pad2(at.getUTCDate())}/${pad2(at.getUTCMonth() + 1)}/${at.getUTCFullYear()}`;
  return {
    time,
    time12,
    date,
    datetime: `${date} ${time}`,
    datetime12: `${date} ${time12}`,
  };
}

function memberNick(member: GuildMember | null): string {
  if (!member) return "";
  return member.nickname || member.displayName || member.user.username;
}

/**
 * Reemplaza placeholders `{…}` en texto de Custom Commands.
 */
export function parseCustomCommandVariables(
  input: string,
  ctx: VariableResolveContext,
): string {
  if (!input) return input;

  const { interaction } = ctx;
  const user = interaction.user;
  const guild = interaction.guild as Guild | null;
  const member =
    interaction.member && "roles" in interaction.member
      ? (interaction.member as GuildMember)
      : null;
  const channel = interaction.channel;
  const clock = utcClockParts();
  const target = ctx.target ?? null;
  const everyone = ctx.allowEveryone ? "@everyone" : "everyone";
  const here = ctx.allowEveryone ? "@here" : "here";

  const avatar = user.displayAvatarURL({
    size: 256,
    extension: "png",
    forceStatic: true,
  });

  const replacements: Record<string, string> = {
    "{user}": `<@${user.id}>`,
    "{user.mention}": `<@${user.id}>`,
    "{user.id}": user.id,
    "{user.name}": user.username,
    "{user.username}": user.username,
    "{user.nick}": memberNick(member) || user.username,
    "{user.avatar}": avatar,
    "{avatar}": avatar,
    "{username}": user.username,
    "{user.createdAt}": formatDate(user.createdAt),
    "{user.joinedAt}": formatDate(member?.joinedAt ?? null),
    "{user.level}": ctx.level != null ? String(ctx.level) : "0",
    "{user.xp}": ctx.xp != null ? String(ctx.xp) : "0",
    "{server}": guild?.name ?? "servidor",
    "{server.name}": guild?.name ?? "servidor",
    "{server.id}": guild?.id ?? "",
    "{server.icon}": guild?.iconURL({ size: 256 }) ?? "",
    "{server.memberCount}": String(guild?.memberCount ?? 0),
    "{server.ownerID}": guild?.ownerId ?? "",
    "{server.createdAt}": formatDate(guild?.createdAt ?? null),
    "{channel}":
      channel && "name" in channel ? String(channel.name ?? "canal") : "canal",
    "{channel.name}":
      channel && "name" in channel ? String(channel.name ?? "canal") : "canal",
    "{channel.id}": channel?.id ?? "",
    "{channel.mention}": channel?.id ? `<#${channel.id}>` : "#canal",
    "{everyone}": everyone,
    "{here}": here,
    "{text}": ctx.text ?? "",
    "{target}": target ? `<@${target.id}>` : "",
    "{target.mention}": target ? `<@${target.id}>` : "",
    "{target.username}": target?.username ?? "",
    "{target.id}": target?.id ?? "",
    "{time}": clock.time,
    "{time12}": clock.time12,
    "{date}": clock.date,
    "{datetime}": clock.datetime,
    "{datetime12}": clock.datetime12,
  };

  return applyCustomCommandTokens(input, replacements);
}
