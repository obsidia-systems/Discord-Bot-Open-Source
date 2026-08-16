import type {
  Client,
  Guild,
  GuildMember,
  ImageURLOptions,
  User,
} from "discord.js";

export type ResolvedMemberData = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

/** Opciones seguras para el dashboard (PNG estático, sin GIF/WEBP rotos). */
export function safeAvatarOptions(size: 64 | 128 | 256 = 128): ImageURLOptions {
  return {
    extension: "png",
    size,
    forceStatic: true,
  };
}

export function displayNameFromMember(member: GuildMember): string {
  return (
    member.nickname ||
    member.user.globalName ||
    member.user.username ||
    "Usuario Desconocido"
  );
}

export function displayNameFromUser(user: User): string {
  return user.globalName || user.username || "Usuario Desconocido";
}

/** Avatar de GuildMember: prioriza avatar de servidor (Nitro). */
export function safeMemberAvatarURL(
  member: GuildMember,
  size: 64 | 128 | 256 = 128,
): string {
  return member.displayAvatarURL(safeAvatarOptions(size));
}

/** Avatar global de User en PNG estático. */
export function safeUserAvatarURL(
  user: User,
  size: 64 | 128 | 256 = 128,
): string {
  return user.displayAvatarURL(safeAvatarOptions(size));
}

/**
 * Preview síncrono: si hay miembro en caché usa apodo/avatar de servidor.
 */
export function resolveUserPreview(
  guild: Guild | null | undefined,
  user: User,
  size: 64 | 128 | 256 = 128,
): Omit<ResolvedMemberData, "userId"> & { userId: string } {
  const member = guild?.members.cache.get(user.id);
  if (member) {
    return {
      userId: member.id,
      username: member.user.username,
      displayName: displayNameFromMember(member),
      avatarUrl: safeMemberAvatarURL(member, size),
    };
  }
  return {
    userId: user.id,
    username: user.username,
    displayName: displayNameFromUser(user),
    avatarUrl: safeUserAvatarURL(user, size),
  };
}

/**
 * Resuelve nombre/avatar frescos desde la caché de discord.js (sin SQLite).
 * Prioriza GuildMember (avatar/apodo de servidor).
 */
export async function getResolvedMemberData(
  guild: Guild | null | undefined,
  client: Client,
  userId: string,
  size: 64 | 128 | 256 = 128,
): Promise<ResolvedMemberData> {
  let member: GuildMember | null = null;
  if (guild) {
    member =
      guild.members.cache.get(userId) ??
      (await guild.members.fetch(userId).catch(() => null));
  }

  if (member) {
    return {
      userId,
      username: member.user.username,
      displayName: displayNameFromMember(member),
      avatarUrl: safeMemberAvatarURL(member, size),
    };
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    return {
      userId,
      username: user.username,
      displayName: displayNameFromUser(user),
      avatarUrl: safeUserAvatarURL(user, size),
    };
  }

  return {
    userId,
    username: "desconocido",
    displayName: "Usuario Desconocido",
    avatarUrl: null,
  };
}

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Precarga miembros faltantes en caché (fetch por lotes) y resuelve todos.
 * Evita N llamadas individuales al construir el Top 100.
 */
export async function resolveMembersBatch(
  guild: Guild | null | undefined,
  client: Client,
  userIds: string[],
  size: 64 | 128 | 256 = 128,
): Promise<Map<string, ResolvedMemberData>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, ResolvedMemberData>();

  if (guild && unique.length > 0) {
    const missing = unique.filter((id) => !guild.members.cache.has(id));
    for (const batch of chunkIds(missing, 100)) {
      await guild.members.fetch({ user: batch }).catch(() => null);
    }
  }

  await Promise.all(
    unique.map(async (userId) => {
      const data = await getResolvedMemberData(guild, client, userId, size);
      result.set(userId, data);
    }),
  );

  return result;
}
