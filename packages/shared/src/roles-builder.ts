/** Contratos — Roles Builder (crear y editar roles en Discord desde el panel). */

/** Tope de Discord: 250 roles por guild, incluido @everyone. */
export const DISCORD_GUILD_ROLE_LIMIT = 250;

/** Clave de PermissionFlagsBits de discord.js (ej. `KickMembers`). */
export type DiscordPermissionKey = string;

export interface RolePermissionOption {
  key: DiscordPermissionKey;
  label: string;
  description?: string;
}

export interface RolePermissionGroup {
  id: string;
  label: string;
  permissions: RolePermissionOption[];
}

/** Grupos de permisos para el UI de Roles Builder. */
export const ROLE_PERMISSION_GROUPS: RolePermissionGroup[] = [
  {
    id: "general",
    label: "General",
    permissions: [
      { key: "ViewChannel", label: "Ver canales" },
      { key: "ManageChannels", label: "Gestionar canales" },
      { key: "ManageRoles", label: "Gestionar roles" },
      { key: "CreateGuildExpressions", label: "Crear expresiones" },
      { key: "ManageGuildExpressions", label: "Gestionar expresiones" },
      { key: "CreateEvents", label: "Crear eventos" },
      { key: "ManageEvents", label: "Gestionar eventos" },
      { key: "ViewAuditLog", label: "Ver registro de auditoría" },
      { key: "ViewGuildInsights", label: "Ver estadísticas del servidor" },
      { key: "ManageWebhooks", label: "Gestionar webhooks" },
      { key: "ManageGuild", label: "Gestionar servidor" },
      { key: "CreateInstantInvite", label: "Crear invitación" },
      { key: "ChangeNickname", label: "Cambiar apodo" },
      { key: "ManageNicknames", label: "Gestionar apodos" },
    ],
  },
  {
    id: "moderation",
    label: "Moderación",
    permissions: [
      { key: "KickMembers", label: "Expulsar miembros" },
      { key: "BanMembers", label: "Banear miembros" },
      { key: "ModerateMembers", label: "Aislar temporalmente (timeout)" },
      { key: "ManageMessages", label: "Gestionar mensajes" },
      { key: "PinMessages", label: "Fijar mensajes" },
      { key: "BypassSlowmode", label: "Saltar modo lento" },
      { key: "ManageThreads", label: "Gestionar hilos" },
      { key: "MentionEveryone", label: "Mencionar @everyone / @here / roles" },
    ],
  },
  {
    id: "membership",
    label: "Membresía y texto",
    permissions: [
      { key: "SendMessages", label: "Enviar mensajes" },
      { key: "SendMessagesInThreads", label: "Enviar mensajes en hilos" },
      { key: "CreatePublicThreads", label: "Crear hilos públicos" },
      { key: "CreatePrivateThreads", label: "Crear hilos privados" },
      { key: "EmbedLinks", label: "Insertar enlaces" },
      { key: "AttachFiles", label: "Adjuntar archivos" },
      { key: "AddReactions", label: "Añadir reacciones" },
      { key: "UseExternalEmojis", label: "Usar emojis externos" },
      { key: "UseExternalStickers", label: "Usar stickers externos" },
      { key: "ReadMessageHistory", label: "Leer historial de mensajes" },
      { key: "SendTTSMessages", label: "Enviar mensajes de texto a voz" },
      { key: "UseApplicationCommands", label: "Usar comandos de aplicación" },
      { key: "UseExternalApps", label: "Usar apps externas" },
      { key: "SendVoiceMessages", label: "Enviar mensajes de voz" },
      { key: "SendPolls", label: "Crear encuestas" },
    ],
  },
  {
    id: "voice",
    label: "Voz y escenario",
    permissions: [
      { key: "Connect", label: "Conectar" },
      { key: "Speak", label: "Hablar" },
      { key: "Stream", label: "Video / stream" },
      { key: "UseVAD", label: "Usar detección de voz" },
      { key: "PrioritySpeaker", label: "Prioridad de palabra" },
      { key: "MuteMembers", label: "Silenciar miembros" },
      { key: "DeafenMembers", label: "Ensorquecer miembros" },
      { key: "MoveMembers", label: "Mover miembros" },
      { key: "RequestToSpeak", label: "Pedir hablar (escenario)" },
      { key: "UseSoundboard", label: "Usar soundboard" },
      { key: "UseExternalSounds", label: "Usar sonidos externos" },
      { key: "UseEmbeddedActivities", label: "Usar actividades" },
      { key: "SetVoiceChannelStatus", label: "Estado del canal de voz" },
    ],
  },
];

export function listRolePermissionKeys(): DiscordPermissionKey[] {
  return ROLE_PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map((permission) => permission.key),
  );
}

export const ROLE_PERMISSION_KEY_SET: ReadonlySet<string> = new Set(
  listRolePermissionKeys(),
);

export function isRolesBuilderPermissionKey(key: string): boolean {
  return ROLE_PERMISSION_KEY_SET.has(key);
}

/**
 * Hex `#RRGGBB` → entero Discord. Vacío / `#000000` / `default` → 0.
 * `null` si el formato no es válido.
 */
export function parseRoleColor(
  value: string | null | undefined,
): number | null {
  if (value == null) return 0;
  const raw = value.trim();
  if (!raw || raw === "#000000" || raw.toLowerCase() === "default") return 0;
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

export interface RolesBuilderRole {
  id: string;
  name: string;
  color: number;
  hexColor: string;
  position: number;
  managed: boolean;
  hoist: boolean;
  mentionable: boolean;
  /** Claves del catálogo actualmente activas (nunca incluye Administrator). */
  permissionKeys: DiscordPermissionKey[];
  /** El rol tiene Administrator en Discord; el panel no toca esos bits. */
  hasAdministrator: boolean;
}

export interface RolesBuilderListResponse {
  guildId: string;
  guildName: string;
  /** Id del rol más alto del bot (si no es @everyone). */
  botHighestRoleId: string | null;
  /** Posición del rol más alto del bot (exclusivo: nuevos roles deben quedar por debajo). */
  botHighestPosition: number;
  botCanManageRoles: boolean;
  botRoleName: string | null;
  /** Roles en caché, incluido @everyone. */
  roleCount: number;
  roleLimit: number;
  roles: RolesBuilderRole[];
  permissionGroups: RolePermissionGroup[];
}

export interface CreateGuildRoleRequest {
  name: string;
  /** Hex `#RRGGBB` o vacío / `#000000` = color por defecto. */
  color?: string | null;
  /** Claves PermissionFlagsBits seleccionadas. */
  permissions?: DiscordPermissionKey[];
  hoist?: boolean;
  mentionable?: boolean;
}

export type UpdateGuildRoleRequest = Partial<CreateGuildRoleRequest>;

export interface CreateGuildRoleResponse {
  role: RolesBuilderRole;
  warning?: string | null;
}

export type UpdateGuildRoleResponse = CreateGuildRoleResponse;

export interface DeleteGuildRoleResponse {
  ok: true;
  roleId: string;
}

export interface RolePositionUpdate {
  roleId: string;
  position: number;
}

export interface UpdateRolePositionsRequest {
  positions: RolePositionUpdate[];
}

export interface UpdateRolePositionsResponse {
  roles: RolesBuilderRole[];
}

export function isRoleLocked(
  role: RolesBuilderRole,
  botHighestPosition: number,
  botHighestRoleId: string | null,
): boolean {
  if (botHighestRoleId && role.id === botHighestRoleId) return true;
  if (role.position >= botHighestPosition) return true;
  if (role.managed) return true;
  return false;
}

/** Reordena solo entre slots desbloqueados; los bloqueados conservan su índice. */
export function reorderKeepingLocks(
  list: RolesBuilderRole[],
  lockedIds: Set<string>,
  sourceIndex: number,
  destIndex: number,
): RolesBuilderRole[] {
  if (sourceIndex === destIndex) return list;
  if (lockedIds.has(list[sourceIndex]?.id ?? "")) return list;

  const lockedSlots = list
    .map((role, index) => ({ role, index }))
    .filter(({ role }) => lockedIds.has(role.id));

  const movables = list.filter((role) => !lockedIds.has(role.id));
  const sourceMovableIndex = movables.findIndex(
    (role) => role.id === list[sourceIndex]?.id,
  );

  let destMovableIndex = 0;
  for (let i = 0; i < destIndex; i += 1) {
    const id = list[i]?.id;
    if (id && !lockedIds.has(id)) destMovableIndex += 1;
  }
  if (sourceIndex < destIndex) {
    destMovableIndex = Math.max(0, destMovableIndex - 1);
  }

  if (sourceMovableIndex < 0) return list;
  const nextMovables = [...movables];
  const [moved] = nextMovables.splice(sourceMovableIndex, 1);
  if (!moved) return list;
  nextMovables.splice(
    Math.min(destMovableIndex, nextMovables.length),
    0,
    moved,
  );

  const result: RolesBuilderRole[] = [];
  let movableCursor = 0;
  for (let i = 0; i < list.length; i += 1) {
    const locked = lockedSlots.find((slot) => slot.index === i);
    if (locked) {
      result.push(locked.role);
    } else {
      const next = nextMovables[movableCursor];
      if (next) result.push(next);
      movableCursor += 1;
    }
  }
  return result;
}

/**
 * Asigna posiciones Discord a partir del orden visual (arriba = mayor).
 * Los roles managed ocupan hueco en el índice pero no se envían.
 */
export function buildPositionPayload(
  ordered: RolesBuilderRole[],
  botHighestPosition: number,
  botHighestRoleId: string | null,
): { roleId: string; position: number }[] {
  const belowBot = ordered.filter(
    (role) =>
      role.id !== botHighestRoleId && role.position < botHighestPosition,
  );

  return belowBot
    .map((role, index) => ({
      roleId: role.id,
      position: botHighestPosition - 1 - index,
      managed: role.managed,
    }))
    .filter((row) => !row.managed)
    .map(({ roleId, position }) => ({ roleId, position }));
}
