import {
  DiscordAPIError,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type Role,
} from "discord.js";
import type {
  CreateGuildRoleRequest,
  CreateGuildRoleResponse,
  DeleteGuildRoleResponse,
  RolePositionUpdate,
  RolesBuilderListResponse,
  RolesBuilderRole,
  UpdateGuildRoleRequest,
  UpdateGuildRoleResponse,
  UpdateRolePositionsResponse,
} from "@adobos/shared";
import {
  DISCORD_GUILD_ROLE_LIMIT,
  listRolePermissionKeys,
  parseRoleColor,
  ROLE_PERMISSION_GROUPS,
  ROLE_PERMISSION_KEY_SET,
} from "@adobos/shared";

const AUDIT_REASON = "Adobos Bot — Roles Builder";

export class RolesBuilderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "RolesBuilderError";
  }
}

function resolveGuild(bot: Client, guildId?: string): Guild {
  if (!bot.isReady()) {
    throw new RolesBuilderError(
      "El bot de Discord no está conectado.",
      503,
      "BOT_NOT_READY",
    );
  }

  const id = (guildId ?? "").trim();
  if (!id) {
    throw new RolesBuilderError("Falta guildId.", 400, "MISSING_GUILD_ID");
  }

  const guild = bot.guilds.cache.get(id);
  if (!guild) {
    throw new RolesBuilderError(
      "El bot no está en ese servidor o el guild aún no está en caché.",
      404,
      "GUILD_NOT_FOUND",
    );
  }

  return guild;
}

function permissionKeysFromBitfield(bits: bigint): string[] {
  const keys: string[] = [];
  for (const key of listRolePermissionKeys()) {
    const flag = PermissionFlagsBits[key as keyof typeof PermissionFlagsBits];
    if (typeof flag === "bigint" && (bits & flag) === flag) {
      keys.push(key);
    }
  }
  return keys;
}

function mapRole(role: Role): RolesBuilderRole {
  const bits = role.permissions.bitfield;
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hexColor: role.hexColor.startsWith("#")
      ? role.hexColor.toUpperCase()
      : `#${role.hexColor.toUpperCase()}`,
    position: role.position,
    managed: role.managed,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissionKeys: permissionKeysFromBitfield(bits),
    hasAdministrator:
      (bits & PermissionFlagsBits.Administrator) ===
      PermissionFlagsBits.Administrator,
  };
}

function botMemberContext(guild: Guild): {
  highestRoleId: string | null;
  highestPosition: number;
  canManageRoles: boolean;
  roleName: string | null;
} {
  const me = guild.members.me;
  if (!me) {
    return {
      highestRoleId: null,
      highestPosition: 0,
      canManageRoles: false,
      roleName: null,
    };
  }
  const highest = me.roles.highest;
  const isEveryone = highest.id === guild.id;
  return {
    highestRoleId: isEveryone ? null : highest.id,
    highestPosition: highest.position,
    canManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
    roleName: isEveryone ? null : highest.name,
  };
}

function assertCanManageRoles(canManageRoles: boolean): void {
  if (!canManageRoles) {
    throw new RolesBuilderError(
      "El bot no tiene el permiso «Gestionar roles» en este servidor.",
      403,
      "MISSING_MANAGE_ROLES",
    );
  }
}

/** Convierte claves del catálogo a bitfield. Nunca incluye Administrator. */
export function permissionsBitfieldFromKeys(
  keys: string[] | undefined,
): bigint {
  if (!keys?.length) return 0n;
  let bits = 0n;
  for (const key of keys) {
    if (key === "Administrator") continue;
    if (!ROLE_PERMISSION_KEY_SET.has(key)) continue;
    const flag = PermissionFlagsBits[key as keyof typeof PermissionFlagsBits];
    if (typeof flag === "bigint") {
      bits |= flag;
    }
  }
  return bits;
}

function resolveColor(value: string | null | undefined): number {
  const color = parseRoleColor(value);
  if (color === null) {
    throw new RolesBuilderError(
      "Color inválido. Usa formato #RRGGBB.",
      400,
      "INVALID_COLOR",
    );
  }
  return color;
}

function resolveRoleName(raw: string | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) {
    throw new RolesBuilderError(
      "El nombre del rol es obligatorio.",
      400,
      "MISSING_NAME",
    );
  }
  if (name.length > 100) {
    throw new RolesBuilderError(
      "El nombre del rol no puede superar 100 caracteres.",
      400,
      "NAME_TOO_LONG",
    );
  }
  return name;
}

function friendlyDiscordError(error: unknown, fallback: string): string {
  if (error instanceof DiscordAPIError) {
    if (error.code === 50013) {
      return "Permisos insuficientes: el bot no puede gestionar ese rol o esa posición (jerarquía).";
    }
    if (error.code === 50035) {
      return "Datos inválidos al actualizar roles en Discord.";
    }
    if (error.code === 30035) {
      return `Este servidor ya tiene el máximo de ${DISCORD_GUILD_ROLE_LIMIT} roles de Discord.`;
    }
    if (error.code === 10011) {
      return "Ese rol ya no existe en Discord.";
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function sortedRoles(guild: Guild): RolesBuilderRole[] {
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .map(mapRole)
    .sort((a, b) => b.position - a.position);
}

function assertRoleLimit(guild: Guild): void {
  if (guild.roles.cache.size >= DISCORD_GUILD_ROLE_LIMIT) {
    throw new RolesBuilderError(
      `Este servidor ya tiene el máximo de ${DISCORD_GUILD_ROLE_LIMIT} roles de Discord.`,
      400,
      "ROLE_LIMIT",
    );
  }
}

function resolveEditableRole(
  guild: Guild,
  roleId: string,
  highestPosition: number,
): Role {
  const id = roleId.trim();
  const role = guild.roles.cache.get(id);
  if (!role || role.id === guild.id) {
    throw new RolesBuilderError(
      `Rol no encontrado: ${id}`,
      404,
      "ROLE_NOT_FOUND",
    );
  }
  if (role.managed) {
    throw new RolesBuilderError(
      `El rol «${role.name}» es managed y no se puede gestionar.`,
      400,
      "ROLE_MANAGED",
    );
  }
  if (role.position >= highestPosition) {
    throw new RolesBuilderError(
      `El rol «${role.name}» está por encima (o al nivel) del bot y no se puede gestionar.`,
      403,
      "ROLE_ABOVE_BOT",
    );
  }
  return role;
}

export async function listGuildRoles(
  bot: Client,
  guildId?: string,
): Promise<RolesBuilderListResponse> {
  const guild = resolveGuild(bot, guildId);
  await guild.roles.fetch().catch(() => null);

  const botCtx = botMemberContext(guild);

  return {
    guildId: guild.id,
    guildName: guild.name,
    botHighestRoleId: botCtx.highestRoleId,
    botHighestPosition: botCtx.highestPosition,
    botCanManageRoles: botCtx.canManageRoles,
    botRoleName: botCtx.roleName,
    roleCount: guild.roles.cache.size,
    roleLimit: DISCORD_GUILD_ROLE_LIMIT,
    roles: sortedRoles(guild),
    permissionGroups: ROLE_PERMISSION_GROUPS,
  };
}

export async function createGuildRole(
  bot: Client,
  input: CreateGuildRoleRequest,
  guildId?: string,
): Promise<CreateGuildRoleResponse> {
  const guild = resolveGuild(bot, guildId);
  await guild.roles.fetch().catch(() => null);
  const botCtx = botMemberContext(guild);

  assertCanManageRoles(botCtx.canManageRoles);
  assertRoleLimit(guild);

  const name = resolveRoleName(input.name);
  const color = resolveColor(input.color);
  const permissions = permissionsBitfieldFromKeys(input.permissions);
  const hoist = Boolean(input.hoist);
  const mentionable = Boolean(input.mentionable);

  const position = Math.max(0, botCtx.highestPosition - 1);

  let role: Role;
  try {
    role = await guild.roles.create({
      name,
      colors: { primaryColor: color },
      permissions,
      hoist,
      mentionable,
      position,
      reason: AUDIT_REASON,
    });
  } catch (error) {
    throw new RolesBuilderError(
      friendlyDiscordError(error, "No se pudo crear el rol."),
      502,
      "DISCORD_CREATE_FAILED",
    );
  }

  return {
    role: mapRole(role),
    warning:
      role.position !== position
        ? "Discord colocó el rol en otra posición. Reordena en la lista si hace falta."
        : null,
  };
}

export async function updateGuildRole(
  bot: Client,
  roleId: string,
  input: UpdateGuildRoleRequest,
  guildId?: string,
): Promise<UpdateGuildRoleResponse> {
  const guild = resolveGuild(bot, guildId);
  await guild.roles.fetch().catch(() => null);
  const botCtx = botMemberContext(guild);

  assertCanManageRoles(botCtx.canManageRoles);
  const role = resolveEditableRole(guild, roleId, botCtx.highestPosition);

  if (
    input.permissions !== undefined &&
    role.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    throw new RolesBuilderError(
      "No se pueden cambiar los permisos de un rol con Administrator.",
      403,
      "PERMISSIONS_ADMIN_LOCKED",
    );
  }

  const edit: {
    name?: string;
    colors?: { primaryColor: number };
    permissions?: bigint;
    hoist?: boolean;
    mentionable?: boolean;
    reason: string;
  } = { reason: AUDIT_REASON };

  if (input.name !== undefined) edit.name = resolveRoleName(input.name);
  if (input.color !== undefined) {
    edit.colors = { primaryColor: resolveColor(input.color) };
  }
  if (input.permissions !== undefined) {
    edit.permissions = permissionsBitfieldFromKeys(input.permissions);
  }
  if (input.hoist !== undefined) edit.hoist = Boolean(input.hoist);
  if (input.mentionable !== undefined) {
    edit.mentionable = Boolean(input.mentionable);
  }

  let updated: Role;
  try {
    updated = await role.edit(edit);
  } catch (error) {
    throw new RolesBuilderError(
      friendlyDiscordError(error, "No se pudo actualizar el rol."),
      502,
      "DISCORD_UPDATE_FAILED",
    );
  }

  return { role: mapRole(updated), warning: null };
}

export async function deleteGuildRole(
  bot: Client,
  roleId: string,
  guildId?: string,
): Promise<DeleteGuildRoleResponse> {
  const guild = resolveGuild(bot, guildId);
  await guild.roles.fetch().catch(() => null);
  const botCtx = botMemberContext(guild);

  assertCanManageRoles(botCtx.canManageRoles);
  const role = resolveEditableRole(guild, roleId, botCtx.highestPosition);

  try {
    await role.delete(AUDIT_REASON);
  } catch (error) {
    throw new RolesBuilderError(
      friendlyDiscordError(error, "No se pudo borrar el rol."),
      502,
      "DISCORD_DELETE_FAILED",
    );
  }

  return { ok: true, roleId: role.id };
}

export async function updateRolePositions(
  bot: Client,
  positions: RolePositionUpdate[],
  guildId?: string,
): Promise<UpdateRolePositionsResponse> {
  const guild = resolveGuild(bot, guildId);
  const botCtx = botMemberContext(guild);

  assertCanManageRoles(botCtx.canManageRoles);

  if (!Array.isArray(positions) || positions.length === 0) {
    throw new RolesBuilderError(
      "Envía al menos un cambio de posición.",
      400,
      "EMPTY_POSITIONS",
    );
  }

  await guild.roles.fetch().catch(() => null);

  const maxAllowed = Math.max(0, botCtx.highestPosition - 1);
  const payload: { role: string; position: number }[] = [];

  for (const entry of positions) {
    const roleId = String(entry.roleId ?? "").trim();
    const position = Math.floor(Number(entry.position));

    if (!roleId) {
      throw new RolesBuilderError(
        "Cada entrada necesita un roleId válido.",
        400,
        "INVALID_ROLE_ID",
      );
    }
    if (!Number.isFinite(position) || position < 0) {
      throw new RolesBuilderError(
        "Las posiciones deben ser números ≥ 0.",
        400,
        "INVALID_POSITION",
      );
    }
    if (position >= botCtx.highestPosition || position > maxAllowed) {
      throw new RolesBuilderError(
        `La posición ${position} iguala o supera el rol del bot (pos ${botCtx.highestPosition}).`,
        400,
        "POSITION_ABOVE_BOT",
      );
    }

    resolveEditableRole(guild, roleId, botCtx.highestPosition);
    payload.push({ role: roleId, position });
  }

  try {
    await guild.roles.setPositions(payload);
  } catch (error) {
    throw new RolesBuilderError(
      friendlyDiscordError(
        error,
        "No se pudo guardar la nueva jerarquía en Discord.",
      ),
      502,
      "DISCORD_POSITIONS_FAILED",
    );
  }

  await guild.roles.fetch().catch(() => null);

  return { roles: sortedRoles(guild) };
}
