/** Catálogo central de slash commands nativos (única fuente de verdad UI + Discord). */

import { POKEINFO_FORMAT_CHOICES } from "./pokemon.js";

export type SystemCommandCategory =
  | "moderation"
  | "levels"
  | "economy"
  | "utilities"
  | "forms"
  | "pokemon";

/** Tipo Discord de un parámetro slash. */
export type SystemCommandParamType =
  | "USER"
  | "STRING"
  | "INTEGER"
  | "NUMBER"
  | "BOOLEAN"
  | "CHANNEL"
  | "ROLE";

/** Códigos ApplicationCommandOptionType de Discord. */
export const DISCORD_OPTION_TYPE: Record<SystemCommandParamType, number> = {
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  NUMBER: 10,
};

export interface SystemCommandOption {
  name: string;
  type: SystemCommandParamType;
  required: boolean;
  description?: string;
  minValue?: number;
  maxValue?: number;
  /** Discord: habilita sugerencias al escribir (STRING / INTEGER / NUMBER). */
  autocomplete?: boolean;
  /** Opciones fijas (STRING / INTEGER / NUMBER). Máx. 25. */
  choices?: Array<{ name: string; value: string | number }>;
}

export interface SystemCommandDefinition {
  name: string;
  description: string;
  category: SystemCommandCategory;
  /** Valor por defecto de `enabled` si no hay fila en DB. */
  defaultEnabled: boolean;
  /** Opciones slash (Discord + documentación del Sheet). */
  options: SystemCommandOption[];
  /** Si true, la UI muestra el toggle de respuesta efímera. */
  supportsEphemeral: boolean;
  /** Valor por defecto del flag ephemeral. */
  defaultEphemeral: boolean;
  /**
   * Si no hay roles configurados, exige permiso de moderación / admin de Discord.
   */
  requiresAdminByDefault: boolean;
}

/** @deprecated Alias de `options` para UI legacy. */
export type SystemCommandParameter = SystemCommandOption;

export interface SystemCommandPermission {
  guildId: string;
  commandName: string;
  enabled: boolean;
  allowedRoles: string[];
  ignoredChannels: string[];
  ephemeral: boolean;
}

/** Vista unificada catálogo + permisos guardados (dashboard). */
export interface SystemCommandConfig extends SystemCommandDefinition {
  enabled: boolean;
  allowedRoles: string[];
  ignoredChannels: string[];
  ephemeral: boolean;
  /** Alias de `options` para el Sheet/tabla de parámetros. */
  parameters: SystemCommandOption[];
}

export interface SystemCommandsListResponse {
  commands: SystemCommandConfig[];
}

export type UpdateSystemCommandsRequest = {
  commands: Array<{
    commandName: string;
    enabled: boolean;
    allowedRoles: string[];
    ignoredChannels: string[];
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
  economy: "Economía",
  utilities: "Utilidades",
  forms: "Formularios",
  pokemon: "Pokémon",
};

export const SYSTEM_COMMAND_PARAM_TYPE_LABELS: Record<
  SystemCommandParamType,
  string
> = {
  USER: "Usuario",
  STRING: "Texto",
  INTEGER: "Número",
  NUMBER: "Número",
  BOOLEAN: "Booleano",
  CHANNEL: "Canal",
  ROLE: "Rol",
};

/** Sintaxis tipo Discord: `/ban <usuario> [razon]`. */
export function formatSystemCommandSyntax(
  def: Pick<SystemCommandDefinition, "name" | "options">,
): string {
  const parts = def.options.map((p) =>
    p.required ? `<${p.name}>` : `[${p.name}]`,
  );
  return parts.length > 0
    ? `/${def.name} ${parts.join(" ")}`
    : `/${def.name}`;
}

function opt(
  name: string,
  type: SystemCommandParamType,
  required: boolean,
  description: string,
  extra?: Pick<
    SystemCommandOption,
    "minValue" | "maxValue" | "autocomplete" | "choices"
  >,
): SystemCommandOption {
  return { name, type, required, description, ...extra };
}

/**
 * Mega-lista de comandos nativos.
 * Nombres en minúsculas sin espacios (API Discord).
 */
export const SYSTEM_COMMAND_CATALOG: readonly SystemCommandDefinition[] = [
  // ── Moderación ──────────────────────────────────────────────
  {
    name: "ban",
    description:
      "Banea al usuario y opcionalmente borra sus mensajes recientes.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro a banear."),
      opt("razon", "STRING", false, "Motivo del baneo."),
      opt("borrar_dias", "INTEGER", false, "Borrar mensajes de los últimos N días (0–7).", {
        minValue: 0,
        maxValue: 7,
      }),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "kick",
    description: "Expulsa al usuario del servidor.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro a expulsar."),
      opt("razon", "STRING", false, "Motivo de la expulsión."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "timeout",
    description:
      "Aísla al usuario (mute nativo). Duración: 10m, 1h, 24h, etc.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro a silenciar."),
      opt("duracion", "STRING", true, "Duración (ej. 10m, 1h, 24h)."),
      opt("razon", "STRING", false, "Motivo del timeout."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "untimeout",
    description: "Remueve el aislamiento (timeout) de un usuario.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro a liberar."),
      opt("razon", "STRING", false, "Motivo."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "warn",
    description: "Añade una advertencia al expediente del usuario.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro a advertir."),
      opt("razon", "STRING", true, "Motivo de la advertencia."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "warns",
    description: "Muestra el historial de infracciones de un usuario.",
    category: "moderation",
    defaultEnabled: true,
    options: [opt("usuario", "USER", true, "Miembro a consultar.")],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "clearwarns",
    description: "Limpia el expediente de advertencias de un usuario.",
    category: "moderation",
    defaultEnabled: true,
    options: [opt("usuario", "USER", true, "Miembro a limpiar.")],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "purge",
    description:
      "Borra hasta 100 mensajes. Si defines un usuario, solo borra los suyos.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("cantidad", "INTEGER", true, "Cantidad de mensajes (1–100).", {
        minValue: 1,
        maxValue: 100,
      }),
      opt("usuario", "USER", false, "Solo mensajes de este usuario."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "slowmode",
    description: "Activa el modo lento en un canal.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("segundos", "INTEGER", true, "Segundos de slowmode (0–21600).", {
        minValue: 0,
        maxValue: 21600,
      }),
      opt("canal", "CHANNEL", false, "Canal objetivo (por defecto el actual)."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "lock",
    description: "Bloquea un canal para que @everyone no pueda escribir.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("canal", "CHANNEL", false, "Canal a bloquear (por defecto el actual)."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "unlock",
    description: "Desbloquea un canal previamente bloqueado.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("canal", "CHANNEL", false, "Canal a desbloquear (por defecto el actual)."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },

  // ── Rangos y XP ─────────────────────────────────────────────
  {
    name: "rank",
    description: "Muestra el nivel, XP y ranking del usuario.",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", false, "Miembro a consultar (opcional)."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "leaderboard",
    description: "Muestra el top de experiencia del servidor.",
    category: "levels",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "givexp",
    description: "Regala XP a un miembro (solo admin).",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro que recibe XP."),
      opt("cantidad", "INTEGER", true, "Cantidad de XP a otorgar.", {
        minValue: 1,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "removexp",
    description: "Quita XP a un miembro (solo admin).",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro al que quitar XP."),
      opt("cantidad", "INTEGER", true, "Cantidad de XP a quitar.", {
        minValue: 1,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "setlevel",
    description: "Fuerza el nivel de un usuario (solo admin).",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro objetivo."),
      opt("nivel", "INTEGER", true, "Nivel a asignar.", { minValue: 0 }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },

  // ── Economía ────────────────────────────────────────────────
  {
    name: "balance",
    description: "Muestra el dinero en cartera y banco.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", false, "Miembro a consultar (opcional)."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "deposit",
    description: "Guarda dinero de tu cartera en el banco (zona segura).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt(
        "cantidad",
        "STRING",
        true,
        "Cantidad a depositar, o `all`/`todo` para vaciar la cartera.",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "withdraw",
    description: "Saca dinero del banco hacia tu cartera.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt(
        "cantidad",
        "STRING",
        true,
        "Cantidad a retirar, o `all`/`todo` para vaciar el banco.",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "work",
    description: "Trabaja para ganar dinero aleatorio (con cooldown).",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "crime",
    description: "Intenta un crimen: riesgo de multa o recompensa.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "daily",
    description: "Recompensa diaria de dinero.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "weekly",
    description: "Recompensa semanal de dinero.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "monthly",
    description: "Recompensa mensual de dinero.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "pay",
    description: "Transfiere dinero a otro miembro.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Destinatario."),
      opt("cantidad", "INTEGER", true, "Cantidad a transferir.", {
        minValue: 1,
      }),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "baltop",
    description: "Muestra el top de riqueza del servidor.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "addmoney",
    description: "Añade fondos a un miembro (admin).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro objetivo."),
      opt("cantidad", "INTEGER", true, "Cantidad a añadir.", { minValue: 1 }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "removemoney",
    description: "Quita fondos a un miembro (admin).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", true, "Miembro objetivo."),
      opt("cantidad", "INTEGER", true, "Cantidad a quitar.", { minValue: 1 }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "shop",
    description: "Muestra la tienda del servidor.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "buy",
    description: "Compra un ítem de la tienda del servidor.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("item", "STRING", true, "Nombre del ítem (escribe para buscar).", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "coinflip",
    description: "Apuesta a cara o cruz.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("apuesta", "INTEGER", true, "Cantidad a apostar.", { minValue: 1 }),
      opt("lado", "STRING", true, "Cara o cruz.", {
        choices: [
          { name: "Cara", value: "cara" },
          { name: "Cruz", value: "cruz" },
        ],
      }),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "roulette",
    description: "Apuesta en la ruleta del casino.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("apuesta", "INTEGER", true, "Cantidad a apostar.", { minValue: 1 }),
      opt("tipo", "STRING", true, "Tipo de apuesta.", {
        choices: [
          { name: "Rojo", value: "rojo" },
          { name: "Negro", value: "negro" },
          { name: "Verde", value: "verde" },
          { name: "Número exacto", value: "numero" },
        ],
      }),
      opt("valor_numero", "INTEGER", false, "Número (0–36) si tipo = numero.", {
        minValue: 0,
        maxValue: 36,
      }),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "blackjack",
    description: "Juega una mano de blackjack.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("apuesta", "INTEGER", true, "Cantidad a apostar.", { minValue: 1 }),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },

  // ── Pokémon ─────────────────────────────────────────────────
  {
    name: "pokeinfo",
    description: "Muestra la ficha de un Pokémon (PokéAPI).",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Nombre o número del Pokémon.", {
        autocomplete: true,
      }),
      opt(
        "juego_formato",
        "STRING",
        false,
        "Juego / formato competitivo (vacío = gen por defecto del panel).",
        {
          choices: POKEINFO_FORMAT_CHOICES.map((c) => ({
            name: c.name,
            value: c.value,
          })),
        },
      ),
      opt(
        "publico",
        "BOOLEAN",
        false,
        "Mostrar el resultado a todos en el canal (Por defecto: Falso).",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "teambuilder",
    description: "Ayuda a armar un equipo competitivo.",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Pokémon base del equipo.", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "weakness",
    description: "Calcula debilidades y resistencias de tipos.",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Pokémon o tipo a consultar.", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "breeding",
    description: "Información de cría y egg groups.",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Pokémon a consultar.", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "location",
    description: "Ubicaciones / encuentros del Pokémon.",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Pokémon a consultar.", {
        autocomplete: true,
      }),
      opt(
        "publico",
        "BOOLEAN",
        false,
        "Mostrar el resultado a todos en el canal (Por defecto: Falso).",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "counters",
    description: "Contadores competitivos sugeridos.",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Pokémon a contrarrestar.", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "sandwich",
    description: "Recetas de sándwich (Scarlet/Violet).",
    category: "pokemon",
    defaultEnabled: true,
    options: [
      opt("pokemon", "STRING", true, "Pokémon / efecto a potenciar.", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },

  // ── Utilidades ──────────────────────────────────────────────
  {
    name: "userinfo",
    description:
      "Muestra fecha de creación, ingreso, roles y permisos de un usuario.",
    category: "utilities",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", false, "Miembro a consultar (opcional)."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "serverinfo",
    description:
      "Muestra boost, canales, roles, emojis y dueño del servidor.",
    category: "utilities",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "avatar",
    description: "Muestra el avatar global y de servidor en alta resolución.",
    category: "utilities",
    defaultEnabled: true,
    options: [
      opt("usuario", "USER", false, "Miembro a consultar (opcional)."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "ping",
    description: "Muestra la latencia del WebSocket (ms).",
    category: "utilities",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "help",
    description:
      "Menú interactivo con los comandos disponibles según tus permisos.",
    category: "utilities",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
] as const;

export function getSystemCommandDefinition(
  name: string,
): SystemCommandDefinition | undefined {
  return SYSTEM_COMMAND_CATALOG.find((c) => c.name === name);
}

export function listSystemCommandNames(): string[] {
  return SYSTEM_COMMAND_CATALOG.map((c) => c.name);
}

export function defaultSystemCommandPermission(
  guildId: string,
  def: SystemCommandDefinition,
): SystemCommandPermission {
  return {
    guildId,
    commandName: def.name,
    enabled: def.defaultEnabled,
    allowedRoles: [],
    ignoredChannels: [],
    ephemeral: def.defaultEphemeral,
  };
}

/** Cuerpo mínimo REST de un slash (sin token). */
export function toDiscordSlashCommandBody(def: SystemCommandDefinition): {
  name: string;
  description: string;
  options?: Array<{
    type: number;
    name: string;
    description: string;
    required?: boolean;
    autocomplete?: boolean;
    min_value?: number;
    max_value?: number;
    choices?: Array<{ name: string; value: string | number }>;
  }>;
  /** Discord bitfield string, o `null` = visible para todos. */
  default_member_permissions?: string | null;
} {
  const options = def.options.map((o) => ({
    type: DISCORD_OPTION_TYPE[o.type],
    name: o.name,
    description: (o.description ?? o.name).slice(0, 100),
    required: o.required,
    ...(o.autocomplete ? { autocomplete: true } : {}),
    ...(o.minValue !== undefined ? { min_value: o.minValue } : {}),
    ...(o.maxValue !== undefined ? { max_value: o.maxValue } : {}),
    ...(o.choices?.length
      ? {
          choices: o.choices.slice(0, 25).map((c) => ({
            name: c.name.slice(0, 100),
            value: c.value,
          })),
        }
      : {}),
  }));
  return {
    name: def.name,
    description: def.description.slice(0, 100),
    ...(options.length ? { options } : {}),
  };
}

/**
 * Preset de visibilidad nativa en Discord (autocompletado).
 * `public` → null (todos). El backend mapea a PermissionFlagsBits.
 */
export type SystemCommandDiscordPermPreset =
  | "public"
  | "moderation"
  | "manage_guild"
  | "administrator";

export function resolveDiscordPermPreset(
  def: SystemCommandDefinition,
): SystemCommandDiscordPermPreset {
  if (!def.requiresAdminByDefault) return "public";
  if (
    def.name === "givexp" ||
    def.name === "removexp" ||
    def.name === "setlevel"
  ) {
    return "administrator";
  }
  if (def.category === "moderation") return "moderation";
  return "manage_guild";
}
