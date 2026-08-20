import type { ChatInputCommandInteraction, Guild, GuildMember } from "discord.js";

export type VariableResolveContext = {
  interaction: ChatInputCommandInteraction;
  /** Stats opcionales del módulo de niveles. */
  level?: number | null;
  xp?: number | null;
};

function formatDate(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function nowParts(): {
  time: string;
  time12: string;
  date: string;
  datetime: string;
  datetime12: string;
} {
  const d = new Date();
  const h24 = pad2(d.getHours());
  const m = pad2(d.getMinutes());
  const time = `${h24}:${m}`;
  const h12raw = d.getHours() % 12 || 12;
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const time12 = `${h12raw}:${m} ${ampm}`;
  const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
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
 * Reemplaza placeholders `{…}` en texto de comandos custom.
 * Extensible: añadir claves al mapa `replacements`.
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
  const clock = nowParts();

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
    "{everyone}": "@everyone",
    "{here}": "@here",
    "{time}": clock.time,
    "{time12}": clock.time12,
    "{date}": clock.date,
    "{datetime}": clock.datetime,
    "{datetime12}": clock.datetime12,
  };

  // Tokens más largos primero para evitar reemplazos parciales
  const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);
  let out = input;
  for (const key of keys) {
    if (!out.includes(key)) continue;
    out = out.split(key).join(replacements[key] ?? "");
  }
  return out;
}
