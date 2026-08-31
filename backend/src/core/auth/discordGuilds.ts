import { ADMINISTRATOR_BIT, GUILD_CACHE_TTL_MS, MANAGE_GUILD_BIT, type ManagedGuild } from "./types.js";

interface DiscordGuildPayload {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

interface CacheEntry {
  fetchedAt: number;
  guilds: ManagedGuild[];
}

const cache = new Map<string, CacheEntry>();

function iconUrl(guildId: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}`;
}

function hasManageGuild(guild: DiscordGuildPayload): boolean {
  if (guild.owner) return true;
  try {
    const bits = BigInt(guild.permissions);
    return (bits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT || (bits & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
  } catch {
    return false;
  }
}

export function toManagedGuild(guild: DiscordGuildPayload): ManagedGuild {
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    iconUrl: iconUrl(guild.id, guild.icon),
    owner: guild.owner,
  };
}

export async function listManagedGuilds(
  userId: string,
  accessToken: string,
): Promise<ManagedGuild[]> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < GUILD_CACHE_TTL_MS) {
    return cached.guilds;
  }

  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord guilds HTTP ${res.status}`);
  }
  const payload = (await res.json()) as DiscordGuildPayload[];
  const guilds = payload.filter(hasManageGuild).map(toManagedGuild);
  cache.set(userId, { fetchedAt: Date.now(), guilds });
  return guilds;
}

export async function userManagesGuild(
  userId: string,
  accessToken: string,
  guildId: string,
): Promise<boolean> {
  const guilds = await listManagedGuilds(userId, accessToken);
  return guilds.some((g) => g.id === guildId);
}

export function invalidateGuildCache(userId: string): void {
  cache.delete(userId);
}
