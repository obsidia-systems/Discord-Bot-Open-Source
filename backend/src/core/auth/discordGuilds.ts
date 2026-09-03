import { cache } from "../cache/store.js";
import { DiscordHttpError } from "../discord/discordHttpError.js";
import { fetchDiscordAsUser } from "./discordUser.js";
import {
  ADMINISTRATOR_BIT,
  GUILD_CACHE_TTL_MS,
  MANAGE_GUILD_BIT,
  type ManagedGuild,
  type StoredSession,
} from "./types.js";

interface DiscordGuildPayload {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

const managedKey = (userId: string) => `guilds:managed:${userId}`;

function iconUrl(guildId: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}`;
}

function hasManageGuild(guild: DiscordGuildPayload): boolean {
  if (guild.owner) return true;
  try {
    const bits = BigInt(guild.permissions);
    return (
      (bits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT ||
      (bits & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT
    );
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
  session: StoredSession,
): Promise<ManagedGuild[]> {
  const cached = await cache().get<ManagedGuild[]>(managedKey(session.userId));
  if (cached) return cached;

  const res = await fetchDiscordAsUser(session, "/users/@me/guilds");
  if (!res.ok) {
    throw new DiscordHttpError(`Discord guilds HTTP ${res.status}`, res.status);
  }
  const payload = (await res.json()) as DiscordGuildPayload[];
  const guilds = payload.filter(hasManageGuild).map(toManagedGuild);
  await cache().set(managedKey(session.userId), guilds, GUILD_CACHE_TTL_MS);
  return guilds;
}

export async function userManagesGuild(
  session: StoredSession,
  guildId: string,
): Promise<boolean> {
  const guilds = await listManagedGuilds(session);
  return guilds.some((g) => g.id === guildId);
}

export function invalidateGuildCache(userId: string): void {
  void cache().del(managedKey(userId));
}
