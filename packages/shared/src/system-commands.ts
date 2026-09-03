/** Catálogo central de slash commands nativos (única fuente de verdad UI + Discord). */

export type SystemCommandCategory =
  | "moderation"
  | "levels"
  | "economy"
  | "utilities"
  | "forms";

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
  moderation: "Moderation",
  levels: "Levels",
  economy: "Economy",
  utilities: "Utilities",
  forms: "Forms",
};

export const SYSTEM_COMMAND_PARAM_TYPE_LABELS: Record<
  SystemCommandParamType,
  string
> = {
  USER: "User",
  STRING: "Text",
  INTEGER: "Number",
  NUMBER: "Number",
  BOOLEAN: "Boolean",
  CHANNEL: "Channel",
  ROLE: "Role",
};

/** Discord-style syntax: `/ban <user> [reason]`. */
export function formatSystemCommandSyntax(
  def: Pick<SystemCommandDefinition, "name" | "options">,
): string {
  const parts = def.options.map((p) =>
    p.required ? `<${p.name}>` : `[${p.name}]`,
  );
  return parts.length > 0 ? `/${def.name} ${parts.join(" ")}` : `/${def.name}`;
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
  // ── Moderation ──────────────────────────────────────────────
  {
    name: "ban",
    description: "Bans the user and optionally deletes their recent messages.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member to ban."),
      opt("reason", "STRING", false, "Reason for the ban."),
      opt(
        "delete_days",
        "INTEGER",
        false,
        "Delete messages from the last N days (0–7).",
        {
          minValue: 0,
          maxValue: 7,
        },
      ),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "kick",
    description: "Kicks the user from the server.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member to kick."),
      opt("reason", "STRING", false, "Reason for the kick."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "timeout",
    description:
      "Times out the user (native mute). Duration: 10m, 1h, 24h, etc.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member to time out."),
      opt("duration", "STRING", true, "Duration (e.g. 10m, 1h, 24h)."),
      opt("reason", "STRING", false, "Reason for the timeout."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "untimeout",
    description: "Removes the timeout from a user.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member to release."),
      opt("reason", "STRING", false, "Reason."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "warn",
    description: "Adds a warning to the user's record.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member to warn."),
      opt("reason", "STRING", true, "Reason for the warning."),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "warns",
    description: "Shows a user's infraction history.",
    category: "moderation",
    defaultEnabled: true,
    options: [opt("user", "USER", true, "Member to look up.")],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "clearwarns",
    description: "Clears a user's warning record.",
    category: "moderation",
    defaultEnabled: true,
    options: [opt("user", "USER", true, "Member to clear.")],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "purge",
    description:
      "Deletes up to 100 messages. If you set a user, only theirs are deleted.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("amount", "INTEGER", true, "Number of messages (1–100).", {
        minValue: 1,
        maxValue: 100,
      }),
      opt("user", "USER", false, "Only messages from this user."),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "slowmode",
    description: "Enables slowmode in a channel.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt("seconds", "INTEGER", true, "Slowmode seconds (0–21600).", {
        minValue: 0,
        maxValue: 21600,
      }),
      opt(
        "channel",
        "CHANNEL",
        false,
        "Target channel (defaults to the current one).",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "lock",
    description: "Locks a channel so @everyone can't send messages.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt(
        "channel",
        "CHANNEL",
        false,
        "Channel to lock (defaults to the current one).",
      ),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },
  {
    name: "unlock",
    description: "Unlocks a previously locked channel.",
    category: "moderation",
    defaultEnabled: true,
    options: [
      opt(
        "channel",
        "CHANNEL",
        false,
        "Channel to unlock (defaults to the current one).",
      ),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: true,
  },

  // ── Levels ──────────────────────────────────────────────────
  {
    name: "rank",
    description: "Shows the user's level, XP and rank.",
    category: "levels",
    defaultEnabled: true,
    options: [opt("user", "USER", false, "Member to look up (optional).")],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "leaderboard",
    description: "Shows the server's XP leaderboard.",
    category: "levels",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "givexp",
    description: "Grants XP to a member (admin only).",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member who receives XP."),
      opt("amount", "INTEGER", true, "Amount of XP to grant.", {
        minValue: 1,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "removexp",
    description: "Removes XP from a member (admin only).",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Member to remove XP from."),
      opt("amount", "INTEGER", true, "Amount of XP to remove.", {
        minValue: 1,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "setlevel",
    description: "Forces a user's level (admin only).",
    category: "levels",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Target member."),
      opt("level", "INTEGER", true, "Level to set.", { minValue: 0 }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },

  // ── Economy ────────────────────────────────────────────────
  {
    name: "balance",
    description: "Shows wallet and bank balance.",
    category: "economy",
    defaultEnabled: true,
    options: [opt("user", "USER", false, "Member to look up (optional).")],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "deposit",
    description: "Moves money from your wallet into the bank (safe zone).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt(
        "amount",
        "STRING",
        true,
        "Amount to deposit, or `all` to empty the wallet.",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "withdraw",
    description: "Withdraws money from the bank to your wallet.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt(
        "amount",
        "STRING",
        true,
        "Amount to withdraw, or `all` to empty the bank.",
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "work",
    description: "Work to earn random money (with cooldown).",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "crime",
    description: "Attempt a crime: risk of a fine or a reward.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "daily",
    description: "Daily money reward.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "weekly",
    description: "Weekly money reward.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "monthly",
    description: "Monthly money reward.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "pay",
    description: "Transfers money to another member.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Recipient."),
      opt("amount", "INTEGER", true, "Amount to transfer.", {
        minValue: 1,
      }),
    ],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "baltop",
    description: "Shows the server's wealth leaderboard.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "addmoney",
    description: "Adds funds to a member (admin).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Target member."),
      opt("amount", "INTEGER", true, "Amount to add.", { minValue: 1 }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "removemoney",
    description: "Removes funds from a member (admin).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Target member."),
      opt("amount", "INTEGER", true, "Amount to remove.", { minValue: 1 }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },
  {
    name: "shop",
    description: "Shows the server shop.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "buy",
    description: "Buy an item from the server shop.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("item", "STRING", true, "Item name (type to search).", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "coinflip",
    description: "Bet on heads or tails.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("bet", "INTEGER", true, "Amount to bet.", { minValue: 1 }),
      opt(
        "side",
        "STRING",
        false,
        "Shortcut: heads or tails. If omitted, you pick with buttons.",
        {
          choices: [
            { name: "Heads", value: "heads" },
            { name: "Tails", value: "tails" },
          ],
        },
      ),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "roulette",
    description: "Bet on the casino roulette.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("bet", "INTEGER", true, "Amount to bet.", { minValue: 1 }),
      opt(
        "type",
        "STRING",
        false,
        "Color or number shortcut. If omitted, you pick at the table.",
        {
          choices: [
            { name: "Red", value: "red" },
            { name: "Black", value: "black" },
            { name: "Green", value: "green" },
            { name: "Exact number", value: "number" },
          ],
        },
      ),
      opt("number", "INTEGER", false, "Number (0–36) if type = number.", {
        minValue: 0,
        maxValue: 36,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "blackjack",
    description: "Play a hand of blackjack.",
    category: "economy",
    defaultEnabled: true,
    options: [opt("bet", "INTEGER", true, "Amount to bet.", { minValue: 1 })],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "slots",
    description: "Spin a 3-reel machine.",
    category: "economy",
    defaultEnabled: true,
    options: [opt("bet", "INTEGER", true, "Amount to bet.", { minValue: 1 })],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "collect-income",
    description: "Collect your role salaries (daily or weekly).",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "rob",
    description: "Try to steal another member's wallet (not the bank).",
    category: "economy",
    defaultEnabled: true,
    options: [opt("user", "USER", true, "Member to rob.")],
    supportsEphemeral: false,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "inventory",
    description: "Shows roles, channels and boosts you bought.",
    category: "economy",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "use",
    description: "Equip or remove a role from your inventory.",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("item", "STRING", true, "Purchased role (type to search).", {
        autocomplete: true,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: false,
  },
  {
    name: "setmoney",
    description: "Sets a member's wallet balance (admin).",
    category: "economy",
    defaultEnabled: true,
    options: [
      opt("user", "USER", true, "Target member."),
      opt("amount", "INTEGER", true, "New wallet balance.", {
        minValue: 0,
      }),
    ],
    supportsEphemeral: true,
    defaultEphemeral: true,
    requiresAdminByDefault: true,
  },

  // ── Utilities ──────────────────────────────────────────────
  {
    name: "userinfo",
    description:
      "Shows a user's creation date, join date, roles and permissions.",
    category: "utilities",
    defaultEnabled: true,
    options: [opt("user", "USER", false, "Member to look up (optional).")],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "serverinfo",
    description:
      "Shows the server's boosts, channels, roles, emojis and owner.",
    category: "utilities",
    defaultEnabled: true,
    options: [],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "avatar",
    description: "Shows the global and server avatar in high resolution.",
    category: "utilities",
    defaultEnabled: true,
    options: [opt("user", "USER", false, "Member to look up (optional).")],
    supportsEphemeral: true,
    defaultEphemeral: false,
    requiresAdminByDefault: false,
  },
  {
    name: "ping",
    description: "Shows the WebSocket latency (ms).",
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
      "Interactive menu of the commands available to you based on your permissions.",
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
