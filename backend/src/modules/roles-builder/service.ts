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
  RolePositionUpdate,
  RolesBuilderListResponse,
  RolesBuilderRole,
  UpdateRolePositionsResponse,
} from "@adobos/shared";
import { ROLE_PERMISSION_GROUPS } from "@adobos/shared";

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
    throw new RolesBuilderError(
      "Falta guildId.",
      400,
      "MISSING_GUILD_ID",
    );
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

function mapRole(role: Role): RolesBuilderRole {
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

/** Convierte claves PermissionFlagsBits a bitfield. */
function permissionsFromKeys(keys: string[] | undefined): bigint {
  if (!keys?.length) return 0n;
  let bits = 0n;
  for (const key of keys) {
    // Nunca otorgar Administrator desde el panel.
    if (key === "Administrator") continue;
    const flag = PermissionFlagsBits[key as keyof typeof PermissionFlagsBits];
    if (typeof flag === "bigint") {
      bits |= flag;
    }
  }
  return bits;
}

function parseColor(value: string | null | undefined): number {
  if (!value) return 0;
  const raw = value.trim();
  if (!raw || raw === "#000000" || raw.toLowerCase() === "default") return 0;
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new RolesBuilderError(
      "Color inválido. Usa formato #RRGGBB.",
      400,
      "INVALID_COLOR",
    );
  }
  return Number.parseInt(hex, 16);
}

function friendlyDiscordError(error: unknown, fallback: string): string {
  if (error instanceof DiscordAPIError) {
    if (error.code === 50013) {
      return "Permisos insuficientes: el bot no puede gestionar ese rol o esa posición (jerarquía).";
    }
    if (error.code === 50035) {
      return "Datos inválidos al actualizar roles en Discord.";
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
  const botCtx = botMemberContext(guild);

  if (!botCtx.canManageRoles) {
    throw new RolesBuilderError(
      "El bot no tiene el permiso «Gestionar roles» en este servidor.",
      403,
      "MISSING_MANAGE_ROLES",
    );
  }

  const name = (input.name ?? "").trim();
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

  const color = parseColor(input.color);
  const permissions = permissionsFromKeys(input.permissions);
  const hoist = Boolean(input.hoist);
  const mentionable = Boolean(input.mentionable);

  // Por defecto: justo debajo del rol más alto del bot.
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
      reason: "Adobos Bot — Fabricador de Roles",
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
    warning: null,
  };
}

export async function updateRolePositions(
  bot: Client,
  positions: RolePositionUpdate[],
  guildId?: string,
): Promise<UpdateRolePositionsResponse> {
  const guild = resolveGuild(bot, guildId);
  const botCtx = botMemberContext(guild);

  if (!botCtx.canManageRoles) {
    throw new RolesBuilderError(
      "El bot no tiene el permiso «Gestionar roles» en este servidor.",
      403,
      "MISSING_MANAGE_ROLES",
    );
  }

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

    const role = guild.roles.cache.get(roleId);
    if (!role || role.id === guild.id) {
      throw new RolesBuilderError(
        `Rol no encontrado: ${roleId}`,
        404,
        "ROLE_NOT_FOUND",
      );
    }
    if (role.managed) {
      throw new RolesBuilderError(
        `El rol «${role.name}» es managed y no se puede reordenar.`,
        400,
        "ROLE_MANAGED",
      );
    }
    if (role.position >= botCtx.highestPosition) {
      throw new RolesBuilderError(
        `El rol «${role.name}» está por encima (o al nivel) del bot y no se puede gestionar.`,
        403,
        "ROLE_ABOVE_BOT",
      );
    }

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
