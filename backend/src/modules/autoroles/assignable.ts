import type { Client, Guild, Role } from "discord.js";
import {
  autoroleAssignDenyReason,
  canAssignAutorole,
  type AutoroleAssignDenyReason,
  type AutoroleRoleSnapshot,
} from "@adobos/shared";
import { AutoRoleError } from "./errors.js";

function snapshot(role: Role): AutoroleRoleSnapshot {
  return {
    id: role.id,
    managed: role.managed,
    position: role.position,
  };
}

export function botHighestPosition(guild: Guild): number {
  return guild.members.me?.roles.highest.position ?? 0;
}

export function isRoleAssignableInGuild(guild: Guild, roleId: string): boolean {
  const role = guild.roles.cache.get(roleId);
  return canAssignAutorole(
    role ? snapshot(role) : null,
    guild.id,
    botHighestPosition(guild),
  );
}

function messageForReason(
  reason: AutoroleAssignDenyReason,
  roleName?: string,
): { message: string; status: number; code: string } {
  const label = roleName ? `«${roleName}»` : "ese rol";
  if (reason === "missing") {
    return {
      message: "Ese rol no existe en este servidor.",
      status: 400,
      code: "ROLE_NOT_FOUND",
    };
  }
  if (reason === "everyone") {
    return {
      message: "No se puede asignar @everyone.",
      status: 400,
      code: "ROLE_EVERYONE",
    };
  }
  if (reason === "managed") {
    return {
      message: `El rol ${label} es managed y Discord no permite asignarlo.`,
      status: 400,
      code: "ROLE_MANAGED",
    };
  }
  return {
    message: `El rol ${label} está al nivel o por encima del bot.`,
    status: 403,
    code: "ROLE_ABOVE_BOT",
  };
}

export async function assertAssignableRole(
  guild: Guild,
  roleId: string,
): Promise<Role> {
  let role = guild.roles.cache.get(roleId) ?? null;
  if (!role) {
    role = await guild.roles.fetch(roleId).catch(() => null);
  }
  const reason = autoroleAssignDenyReason(
    role ? snapshot(role) : null,
    guild.id,
    botHighestPosition(guild),
  );
  if (reason) {
    const info = messageForReason(reason, role?.name);
    throw new AutoRoleError(info.message, info.status, info.code);
  }
  return role as Role;
}

export async function assertAssignableRoleIds(
  bot: Client,
  guildId: string,
  roleIds: string[],
): Promise<void> {
  if (!bot.isReady()) {
    throw new AutoRoleError("El bot no está conectado.", 503, "BOT_NOT_READY");
  }
  const guild = await bot.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new AutoRoleError(
      "El bot no está en ese servidor.",
      404,
      "GUILD_NOT_FOUND",
    );
  }
  if (!guild.members.me) {
    await guild.members.fetchMe().catch(() => null);
  }
  const unique = [...new Set(roleIds.filter(Boolean))];
  for (const id of unique) {
    await assertAssignableRole(guild, id);
  }
}

export function assignableSkipMessage(roleId: string, guild: Guild): string {
  const role = guild.roles.cache.get(roleId);
  const reason = autoroleAssignDenyReason(
    role ? snapshot(role) : null,
    guild.id,
    botHighestPosition(guild),
  );
  if (!reason) return "Ese rol ya no se puede asignar.";
  return messageForReason(reason, role?.name).message;
}
