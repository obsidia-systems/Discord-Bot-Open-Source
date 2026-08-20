/** Catálogo y permisos de slash commands nativos del bot. */

export type SystemCommandCategory =
  | "moderation"
  | "levels"
  | "forms"
  | "utilities";

export interface SystemCommandDefinition {
  name: string;
  description: string;
  category: SystemCommandCategory;
  /** Si true, la UI muestra el toggle de respuesta efímera. */
  supportsEphemeral: boolean;
  /** Valor por defecto del flag ephemeral. */
  defaultEphemeral: boolean;
  /**
   * Si no hay roles configurados, exige permiso de moderación de Discord
   * (Ban/Kick/Moderate/Manage).
   */
  requiresAdminByDefault: boolean;
}

export interface SystemCommandPermission {
  guildId: string;
  commandName: string;
  enabled: boolean;
  allowedRoles: string[];
  ephemeral: boolean;
}

/** Vista unificada catálogo + permisos guardados (dashboard). */
export interface SystemCommandConfig extends SystemCommandDefinition {
  enabled: boolean;
  allowedRoles: string[];
  ephemeral: boolean;
}

export interface SystemCommandsListResponse {
  commands: SystemCommandConfig[];
}

export type UpdateSystemCommandsRequest = {
  commands: Array<{
    commandName: string;
    enabled: boolean;
    allowedRoles: string[];
    ephemeral: boolean;
  }>;
};

export interface SystemCommandsUpdateResponse {
  commands: SystemCommandConfig[];
}

export const SYSTEM_COMMAND_CATEGORY_LABELS: Record<
  SystemCommandCategory,
  string
> = {
  moderation: "Moderación",
  levels: "Rangos y XP",
  forms: "Formularios",
  utilities: "Utilidades",
};

/** Catálogo fijo de slash nativos (alineado con `ctx.command` del backend). */
export const SYSTEM_COMMAND_CATALOG: readonly SystemCommandDefinition[] = [
  {
    name: "rank",
    description:
      "Consulta tu nivel, XP y posición en el ranking (respuesta privada por defecto).",
    category: "levels",
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "nivel",
    description: "Alias de /rank: muestra nivel, XP y ranking.",
    category: "levels",
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "leaderboard",
    description: "Muestra el Top 10 de XP del servidor.",
    category: "levels",
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "ban",
    description: "Banea a un miembro del servidor.",
    category: "moderation",
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "kick",
    description: "Expulsa a un miembro del servidor.",
    category: "moderation",
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "timeout",
    description: "Aplica un timeout (silencio temporal) a un miembro.",
    category: "moderation",
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "ping",
    description: "Comprueba la latencia del bot.",
    category: "utilities",
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "serverinfo",
    description: "Muestra información básica del servidor.",
    category: "utilities",
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
] as const;

export function getSystemCommandDefinition(
  name: string,
): SystemCommandDefinition | undefined {
  return SYSTEM_COMMAND_CATALOG.find((c) => c.name === name);
}

export function defaultSystemCommandPermission(
  guildId: string,
  def: SystemCommandDefinition,
): SystemCommandPermission {
  return {
    guildId,
    commandName: def.name,
    enabled: true,
    allowedRoles: [],
    ephemeral: def.defaultEphemeral,
  };
}
