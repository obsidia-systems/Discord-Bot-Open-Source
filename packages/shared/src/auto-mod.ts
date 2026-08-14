/** Contratos Auto Mod — Fase 1 (filtros + warns + logs). */

export interface AutoModFilters {
  /** Detectar texto Zalgo / combining marks. */
  zalgo: boolean;
  /** Exceso de mayúsculas. */
  excessCaps: boolean;
  /** % máximo de mayúsculas (0–100). Default 70. */
  capsPercentage: number;
  /** Longitud mínima de letras para evaluar caps. Default 8. */
  capsMinLength: number;
  /** Activar filtro de palabras prohibidas. */
  bannedWordsEnabled: boolean;
  /** Palabras prohibidas (tags). */
  bannedWords: string[];
  /** Bloquear enlaces fuera de la lista blanca. */
  antiLinks: boolean;
  /** Dominios/URLs permitidos (tags). */
  allowedLinks: string[];
  /** Bloquear invitaciones discord.gg / discord.com/invite. */
  antiInvites: boolean;
  /** Ráfaga de mensajes. */
  messageSpam: boolean;
  /** Texto idéntico repetido. */
  repeatedText: boolean;
  /** Spam de menciones. */
  mentionSpam: boolean;
  /** Umbral de menciones (por mensaje). Default 5. */
  mentionSpamLimit: number;
  /** Muros de texto (flood). */
  textFlood: boolean;
  /** Máx. caracteres por mensaje. Default 800. */
  floodMaxChars: number;
  /** Máx. saltos de línea. Default 6. */
  floodMaxLines: number;
}

/** Días de caducidad de Warns activos; 0 = nunca caducan. */
export type AutoModWarnDecayDays = 0 | 14 | 30 | 60 | 90;

export const AUTO_MOD_WARN_DECAY_OPTIONS: ReadonlyArray<{
  value: AutoModWarnDecayDays;
  label: string;
}> = [
  { value: 14, label: "14 días" },
  { value: 30, label: "30 días" },
  { value: 60, label: "60 días" },
  { value: 90, label: "90 días" },
  { value: 0, label: "Nunca" },
];

export interface AutoModConfig {
  guildId: string;
  /** Master switch del módulo. */
  enabled: boolean;
  filters: AutoModFilters;
  ignoredRoles: string[];
  ignoredChannels: string[];
  /** Canal de alertas; fallback a Action Logs global. */
  logChannelId: string | null;
  /**
   * Warns más antiguos que este periodo no cuentan para castigos futuros.
   * El expediente histórico se conserva completo. 0 = sin caducidad.
   */
  warnDecayDays: AutoModWarnDecayDays;
  updatedAt: string;
}

export interface AutoModConfigResponse {
  config: AutoModConfig;
}

export type UpdateAutoModConfigRequest = Partial<{
  enabled: boolean;
  filters: Partial<AutoModFilters>;
  ignoredRoles: string[];
  ignoredChannels: string[];
  logChannelId: string | null;
  warnDecayDays: AutoModWarnDecayDays;
}>;

export function defaultAutoModFilters(): AutoModFilters {
  return {
    zalgo: false,
    excessCaps: false,
    capsPercentage: 70,
    capsMinLength: 8,
    bannedWordsEnabled: false,
    bannedWords: [],
    antiLinks: false,
    allowedLinks: [],
    antiInvites: false,
    messageSpam: false,
    repeatedText: false,
    mentionSpam: false,
    mentionSpamLimit: 5,
    textFlood: false,
    floodMaxChars: 800,
    floodMaxLines: 6,
  };
}

export function defaultAutoModConfig(guildId = ""): AutoModConfig {
  return {
    guildId,
    enabled: false,
    filters: defaultAutoModFilters(),
    ignoredRoles: [],
    ignoredChannels: [],
    logChannelId: null,
    warnDecayDays: 30,
    updatedAt: new Date().toISOString(),
  };
}

/** Etiquetas UI de filtros detonados (también en reason del Warn). */
export const AUTO_MOD_FILTER_LABELS = {
  zalgo: "Zalgo",
  excessCaps: "Exceso de mayúsculas",
  bannedWords: "Palabras prohibidas",
  antiLinks: "Anti-Links",
  antiInvites: "Anti-Invitaciones",
  messageSpam: "Spam de mensajes",
  repeatedText: "Texto repetido",
  mentionSpam: "Spam de menciones",
  textFlood: "Muros de texto",
} as const;

export type AutoModFilterKey = keyof typeof AUTO_MOD_FILTER_LABELS;

export const AUTO_MOD_TOGGLE_FILTER_COUNT = 9;

export function normalizeWarnDecayDays(
  value: unknown,
): AutoModWarnDecayDays {
  const n = Math.round(Number(value));
  if (n === 0 || n === 14 || n === 30 || n === 60 || n === 90) return n;
  return 30;
}

/** Cuenta toggles de filtro activos (para monitor). */
export function countActiveAutoModFilters(filters: AutoModFilters): number {
  let n = 0;
  if (filters.zalgo) n += 1;
  if (filters.excessCaps) n += 1;
  if (filters.bannedWordsEnabled) n += 1;
  if (filters.antiLinks) n += 1;
  if (filters.antiInvites) n += 1;
  if (filters.messageSpam) n += 1;
  if (filters.repeatedText) n += 1;
  if (filters.mentionSpam) n += 1;
  if (filters.textFlood) n += 1;
  return n;
}
