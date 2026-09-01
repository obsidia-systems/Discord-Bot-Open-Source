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

/** Tope de palabras prohibidas en un POST / guardado. */
export const AUTO_MOD_MAX_BANNED_WORDS = 200;
/** Tope de hosts/URLs en la allowlist de Anti-Links. */
export const AUTO_MOD_MAX_ALLOWED_LINKS = 50;
/** Longitud máxima por palabra prohibida. */
export const AUTO_MOD_MAX_WORD_LENGTH = 64;
/** Longitud máxima por entrada de allowlist. */
export const AUTO_MOD_MAX_LINK_LENGTH = 256;

/** Días de caducidad de Warns activos; 0 = nunca caducan. */
export type AutoModWarnDecayDays = 0 | 14 | 30 | 60 | 90;

export type AutoModPunishmentAction =
  | "TIMEOUT"
  | "KICK"
  | "BAN"
  | "REMOVE_XP"
  | "XP_FREEZE";

/**
 * Regla de escalado: al llegar exactamente a `warnThreshold` warns activos
 * se ejecuta `actionType`. `actionParam` es ms (TIMEOUT / XP_FREEZE) o
 * cantidad de XP (REMOVE_XP); null para KICK/BAN.
 */
export interface AutoModPunishment {
  warnThreshold: number;
  actionType: AutoModPunishmentAction;
  actionParam: number | null;
}

export const AUTO_MOD_PUNISHMENT_ACTION_OPTIONS: ReadonlyArray<{
  value: AutoModPunishmentAction;
  label: string;
}> = [
  { value: "TIMEOUT", label: "Timeout" },
  { value: "KICK", label: "Kick" },
  { value: "BAN", label: "Ban" },
  { value: "REMOVE_XP", label: "Quitar XP" },
  { value: "XP_FREEZE", label: "Congelar XP" },
];

/** Duraciones para TIMEOUT y XP_FREEZE (valor = ms). */
export const AUTO_MOD_DURATION_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
}> = [
  { value: 10 * 60 * 1000, label: "10 min" },
  { value: 60 * 60 * 1000, label: "1 hora" },
  { value: 12 * 60 * 60 * 1000, label: "12 horas" },
  { value: 24 * 60 * 60 * 1000, label: "24 horas" },
  { value: 7 * 24 * 60 * 60 * 1000, label: "1 semana" },
];

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
  /**
   * Si true, cada hit de filtro registra un Warn (cuenta para escalado).
   * Si false, solo se borra el mensaje (modo “solo borrar”).
   */
  warnOnHit: boolean;
  /** DM al usuario cuando se registra el Warn. Ignorado si `warnOnHit` es false. */
  dmOnHit: boolean;
  /** Saltar miembros con Administrator o ManageMessages. */
  skipStaff: boolean;
  /** Escalado dinámico de sanciones por umbral de Warns. */
  punishments: AutoModPunishment[];
  updatedAt: string;
}

export interface AutoModConfigResponse {
  config: AutoModConfig;
  /** Resultado de sincronizar reglas con AutoMod nativo de Discord (solo POST). */
  nativeSync?: AutoModNativeSyncResult;
}

export interface AutoModNativeSyncResult {
  ok: boolean;
  message: string;
}

export type UpdateAutoModConfigRequest = Partial<{
  enabled: boolean;
  filters: Partial<AutoModFilters>;
  ignoredRoles: string[];
  ignoredChannels: string[];
  logChannelId: string | null;
  warnDecayDays: AutoModWarnDecayDays;
  warnOnHit: boolean;
  dmOnHit: boolean;
  skipStaff: boolean;
  punishments: AutoModPunishment[];
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
    warnOnHit: true,
    dmOnHit: true,
    skipStaff: false,
    punishments: [],
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

export function normalizeWarnDecayDays(value: unknown): AutoModWarnDecayDays {
  const n = Math.round(Number(value));
  if (n === 0 || n === 14 || n === 30 || n === 60 || n === 90) return n;
  return 30;
}

const PUNISHMENT_ACTIONS = new Set<AutoModPunishmentAction>([
  "TIMEOUT",
  "KICK",
  "BAN",
  "REMOVE_XP",
  "XP_FREEZE",
]);

export function normalizeAutoModPunishments(
  value: unknown,
): AutoModPunishment[] {
  if (!Array.isArray(value)) return [];
  const out: AutoModPunishment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const actionType = String(row.actionType ?? "").toUpperCase();
    if (!PUNISHMENT_ACTIONS.has(actionType as AutoModPunishmentAction)) {
      continue;
    }
    const warnThreshold = Math.max(
      1,
      Math.min(100, Math.round(Number(row.warnThreshold) || 1)),
    );
    let actionParam: number | null = null;
    if (actionType === "TIMEOUT" || actionType === "XP_FREEZE") {
      const ms = Math.round(Number(row.actionParam));
      const allowed = AUTO_MOD_DURATION_OPTIONS.some((o) => o.value === ms);
      actionParam = allowed ? ms : AUTO_MOD_DURATION_OPTIONS[0]!.value;
    } else if (actionType === "REMOVE_XP") {
      actionParam = Math.max(1, Math.round(Number(row.actionParam) || 100));
    }
    out.push({
      warnThreshold,
      actionType: actionType as AutoModPunishmentAction,
      actionParam,
    });
  }
  return out.sort((a, b) => a.warnThreshold - b.warnThreshold);
}

export function newAutoModPunishmentRow(): AutoModPunishment {
  return {
    warnThreshold: 3,
    actionType: "TIMEOUT",
    actionParam: AUTO_MOD_DURATION_OPTIONS[0]!.value,
  };
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
