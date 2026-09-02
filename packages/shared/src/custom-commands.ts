/** Contratos Custom Commands (slash de guild). */

export const CUSTOM_COMMANDS_DISCORD_MAX = 100;

export interface CustomCommandEmbed {
  title: string;
  description: string;
  color: string;
  imageUrl: string | null;
}

export interface CustomCommandResponseData {
  /** Texto plano (soporta variables). */
  content: string;
  /** Embed opcional. */
  embed: CustomCommandEmbed | null;
}

export interface CustomCommandOptions {
  /** Respuesta efímera (solo el invocador). */
  ephemeral: boolean;
  /** Enviar por DM en lugar del canal. */
  dmResponse: boolean;
  /** Borrar la respuesta del bot tras unos segundos. */
  autoDelete: boolean;
  /** Cooldown anti-spam en segundos (0 = sin límite). */
  cooldownSeconds: number;
  /** Desactiva todas las notificaciones (ni {user}). */
  disableMentions: boolean;
  /** Permite que {everyone} / {here} notifiquen. Default false. */
  allowEveryone: boolean;
  /** Añade opción slash STRING `texto` → {text}. */
  acceptText: boolean;
  /** Añade opción slash USER `usuario` → {target}. */
  acceptUser: boolean;
}

export interface CustomCommandPermissions {
  allowedRoleIds: string[];
  ignoredRoleIds: string[];
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
}

export interface CustomCommand {
  id: number;
  guildId: string;
  name: string;
  description: string;
  responseData: CustomCommandResponseData;
  options: CustomCommandOptions;
  permissions: CustomCommandPermissions;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomCommandsListResponse {
  commands: CustomCommand[];
}

export interface CustomCommandResponse {
  command: CustomCommand;
  /** false si Discord no recibió el PUT (el comando igual quedó en BD). */
  synced?: boolean;
  warning?: string;
}

export type CreateCustomCommandRequest = {
  name: string;
  description: string;
  responseData: CustomCommandResponseData;
  options?: Partial<CustomCommandOptions>;
  permissions?: Partial<CustomCommandPermissions>;
  isActive?: boolean;
};

export type UpdateCustomCommandRequest = Partial<{
  name: string;
  description: string;
  responseData: CustomCommandResponseData;
  options: Partial<CustomCommandOptions>;
  permissions: Partial<CustomCommandPermissions>;
  isActive: boolean;
}>;

export const DEFAULT_CUSTOM_COMMAND_EMBED_COLOR = "#5865F2";

export const CUSTOM_COMMAND_NAME_REGEX = /^[a-z0-9_-]{1,32}$/;

export function defaultCustomCommandEmbed(): CustomCommandEmbed {
  return {
    title: "",
    description: "",
    color: DEFAULT_CUSTOM_COMMAND_EMBED_COLOR,
    imageUrl: null,
  };
}

export function defaultCustomCommandResponseData(): CustomCommandResponseData {
  return {
    content: "Hola {user}!",
    embed: null,
  };
}

export function defaultCustomCommandOptions(): CustomCommandOptions {
  return {
    ephemeral: false,
    dmResponse: false,
    autoDelete: false,
    cooldownSeconds: 0,
    disableMentions: false,
    allowEveryone: false,
    acceptText: false,
    acceptUser: false,
  };
}

export function defaultCustomCommandPermissions(): CustomCommandPermissions {
  return {
    allowedRoleIds: [],
    ignoredRoleIds: [],
    allowedChannelIds: [],
    ignoredChannelIds: [],
  };
}

export function defaultCustomCommand(guildId = ""): CustomCommand {
  return {
    id: 0,
    guildId,
    name: "",
    description: "Comando personalizado",
    responseData: defaultCustomCommandResponseData(),
    options: defaultCustomCommandOptions(),
    permissions: defaultCustomCommandPermissions(),
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeCustomCommandName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

export function isValidCustomCommandName(value: string): boolean {
  return CUSTOM_COMMAND_NAME_REGEX.test(value);
}

function normalizeColor(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return DEFAULT_CUSTOM_COMMAND_EMBED_COLOR;
}

function normalizeMediaRef(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw.slice(0, 500);
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 500);
  return null;
}

export function normalizeCustomCommandEmbed(
  input: Partial<CustomCommandEmbed> | null | undefined,
): CustomCommandEmbed | null {
  if (!input) return null;
  const title = String(input.title ?? "")
    .trim()
    .slice(0, 256);
  const description = String(input.description ?? "")
    .trim()
    .slice(0, 4000);
  const imageUrl = normalizeMediaRef(input.imageUrl);
  if (!title && !description && !imageUrl) return null;
  return {
    title: title || "Embed",
    description,
    color: normalizeColor(input.color),
    imageUrl,
  };
}

export function normalizeCustomCommandResponseData(
  input: Partial<CustomCommandResponseData> | undefined,
): CustomCommandResponseData {
  const base = defaultCustomCommandResponseData();
  if (!input) return base;
  return {
    content: String(input.content ?? "").slice(0, 2000),
    embed: normalizeCustomCommandEmbed(input.embed ?? null),
  };
}

export function normalizeCustomCommandOptions(
  input: Partial<CustomCommandOptions> | undefined,
): CustomCommandOptions {
  const base = defaultCustomCommandOptions();
  if (!input) return base;
  const cooldown = Math.round(Number(input.cooldownSeconds));
  return {
    ephemeral: Boolean(input.ephemeral),
    dmResponse: Boolean(input.dmResponse),
    autoDelete: Boolean(input.autoDelete),
    cooldownSeconds:
      Number.isFinite(cooldown) && cooldown > 0
        ? Math.min(cooldown, 86_400)
        : 0,
    disableMentions: Boolean(input.disableMentions),
    allowEveryone: Boolean(input.allowEveryone),
    acceptText: Boolean(input.acceptText),
    acceptUser: Boolean(input.acceptUser),
  };
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!/^\d{17,20}$/.test(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

export function normalizeCustomCommandPermissions(
  input: Partial<CustomCommandPermissions> | undefined,
): CustomCommandPermissions {
  const base = defaultCustomCommandPermissions();
  if (!input) return base;
  return {
    allowedRoleIds: normalizeIdList(input.allowedRoleIds),
    ignoredRoleIds: normalizeIdList(input.ignoredRoleIds),
    allowedChannelIds: normalizeIdList(input.allowedChannelIds),
    ignoredChannelIds: normalizeIdList(input.ignoredChannelIds),
  };
}

/** Categorías de variables para la hoja de referencia del panel. */
export const CUSTOM_COMMAND_VARIABLE_GROUPS: {
  id: string;
  title: string;
  items: { token: string; description: string }[];
}[] = [
  {
    id: "general",
    title: "Generales",
    items: [
      { token: "{user}", description: "Mención del usuario" },
      { token: "{username}", description: "Nombre de usuario" },
      { token: "{avatar}", description: "URL del avatar" },
      { token: "{server}", description: "Nombre del servidor" },
      { token: "{channel}", description: "Nombre del canal" },
    ],
  },
  {
    id: "user",
    title: "Usuario",
    items: [
      { token: "{user.id}", description: "ID del usuario" },
      { token: "{user.mention}", description: "Mención" },
      { token: "{user.username}", description: "Username" },
      { token: "{user.nick}", description: "Apodo en el servidor" },
      { token: "{user.avatar}", description: "URL del avatar" },
      {
        token: "{user.createdAt}",
        description: "Fecha de creación de la cuenta",
      },
      { token: "{user.joinedAt}", description: "Fecha de ingreso al servidor" },
      { token: "{user.level}", description: "Nivel (módulo Levels)" },
      { token: "{user.xp}", description: "XP (módulo Levels)" },
    ],
  },
  {
    id: "server",
    title: "Servidor",
    items: [
      { token: "{server.id}", description: "ID del servidor" },
      { token: "{server.name}", description: "Nombre" },
      { token: "{server.icon}", description: "URL del icono" },
      { token: "{server.memberCount}", description: "Cantidad de miembros" },
      { token: "{server.ownerID}", description: "ID del dueño" },
      { token: "{server.createdAt}", description: "Fecha de creación" },
    ],
  },
  {
    id: "channel",
    title: "Canal",
    items: [
      { token: "{channel.id}", description: "ID del canal" },
      { token: "{channel.name}", description: "Nombre" },
      { token: "{channel.mention}", description: "Mención del canal" },
    ],
  },
  {
    id: "args",
    title: "Argumentos slash",
    items: [
      { token: "{text}", description: "Opción `texto` (si está activa)" },
      { token: "{target}", description: "Mención del usuario elegido" },
      {
        token: "{target.username}",
        description: "Username del usuario elegido",
      },
      { token: "{target.id}", description: "ID del usuario elegido" },
    ],
  },
  {
    id: "time",
    title: "Fecha y hora",
    items: [
      { token: "{time}", description: "Hora 24h (UTC)" },
      { token: "{time12}", description: "Hora 12h (UTC)" },
      { token: "{date}", description: "Fecha (UTC)" },
      { token: "{datetime}", description: "Fecha + hora 24h (UTC)" },
      { token: "{datetime12}", description: "Fecha + hora 12h (UTC)" },
    ],
  },
];

/** Tokens más largos primero para no partir `{user}` dentro de `{username}`. */
export function applyCustomCommandTokens(
  input: string,
  replacements: Record<string, string>,
): string {
  if (!input) return input;
  const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);
  let out = input;
  for (const key of keys) {
    if (!out.includes(key)) continue;
    out = out.split(key).join(replacements[key] ?? "");
  }
  return out;
}

export function customCommandTemplatePingsInvoker(raw: string): boolean {
  return raw.includes("{user}") || raw.includes("{user.mention}");
}

export function customCommandTemplatePingsTarget(raw: string): boolean {
  return raw.includes("{target}") || raw.includes("{target.mention}");
}

export function customCommandAllowedMentions(input: {
  disableMentions: boolean;
  allowEveryone: boolean;
  pingUserIds: string[];
}): { parse: [] | ["everyone"]; users: string[]; roles: [] } {
  if (input.disableMentions) {
    return { parse: [], users: [], roles: [] };
  }
  const seen = new Set<string>();
  const users: string[] = [];
  for (const id of input.pingUserIds) {
    if (!/^\d{17,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    users.push(id);
  }
  return {
    parse: input.allowEveryone ? ["everyone"] : [],
    users,
    roles: [],
  };
}

export function customCommandPermissionDenial(
  permissions: CustomCommandPermissions,
  roleIds: string[],
  channelId: string,
): string | null {
  if (permissions.ignoredRoleIds.some((id) => roleIds.includes(id))) {
    return "No tienes permiso para usar este comando (rol ignorado).";
  }
  if (
    permissions.allowedRoleIds.length > 0 &&
    !permissions.allowedRoleIds.some((id) => roleIds.includes(id))
  ) {
    return "No tienes un rol permitido para usar este comando.";
  }
  if (permissions.ignoredChannelIds.includes(channelId)) {
    return "Este comando no se puede usar en este canal.";
  }
  if (
    permissions.allowedChannelIds.length > 0 &&
    !permissions.allowedChannelIds.includes(channelId)
  ) {
    return "Este comando solo se puede usar en canales permitidos.";
  }
  return null;
}
