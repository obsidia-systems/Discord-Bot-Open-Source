/** Contratos — Fabricador de Roles (crear roles en Discord desde el panel). */

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

/** Grupos de permisos para el UI del Fabricador. */
export const ROLE_PERMISSION_GROUPS: RolePermissionGroup[] = [
  {
    id: "general",
    label: "General",
    permissions: [
      { key: "ViewChannel", label: "Ver canales" },
      { key: "ManageChannels", label: "Gestionar canales" },
      { key: "ManageRoles", label: "Gestionar roles" },
      { key: "ManageGuildExpressions", label: "Gestionar expresiones" },
      { key: "ViewAuditLog", label: "Ver registro de auditoría" },
      { key: "ViewGuildInsights", label: "Ver estadísticas del servidor" },
      { key: "ManageWebhooks", label: "Gestionar webhooks" },
      { key: "ManageGuild", label: "Gestionar servidor" },
      { key: "CreateInstantInvite", label: "Crear invitación" },
      { key: "ChangeNickname", label: "Cambiar apodo" },
      { key: "ManageNicknames", label: "Gestionar apodos" },
      {
        key: "Administrator",
        label: "Administrador",
        description: "Otorga todos los permisos e ignora denegaciones.",
      },
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
    ],
  },
];

export interface RolesBuilderRole {
  id: string;
  name: string;
  color: number;
  hexColor: string;
  position: number;
  managed: boolean;
  hoist: boolean;
  mentionable: boolean;
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

export interface CreateGuildRoleResponse {
  role: RolesBuilderRole;
  warning?: string | null;
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
