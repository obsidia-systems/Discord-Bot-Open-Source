/** Contratos Auto Mod — Fase 1 (filtros + warns + logs). */

export interface AutoModFilters {
  /** Detectar texto Zalgo / combining marks. */
  zalgo: boolean;
  /** Exceso de mayúsculas. */
  excessCaps: boolean;
  /** Palabras prohibidas (una por línea). */
  bannedWords: string;
  /** Bloquear enlaces fuera de la lista blanca. */
  antiLinks: boolean;
  /** Dominios/URLs permitidos (uno por línea). */
  allowedLinks: string;
  /** Ráfaga de mensajes. */
  messageSpam: boolean;
  /** Texto idéntico repetido. */
  repeatedText: boolean;
  /** Spam de menciones. */
  mentionSpam: boolean;
  /** Umbral de menciones (por mensaje). Default 5. */
  mentionSpamLimit: number;
}

export interface AutoModConfig {
  guildId: string;
  /** Master switch del módulo. */
  enabled: boolean;
  filters: AutoModFilters;
  ignoredRoles: string[];
  ignoredChannels: string[];
  /** Canal de alertas; fallback a Action Logs global. */
  logChannelId: string | null;
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
}>;

export function defaultAutoModFilters(): AutoModFilters {
  return {
    zalgo: false,
    excessCaps: false,
    bannedWords: "",
    antiLinks: false,
    allowedLinks: "",
    messageSpam: false,
    repeatedText: false,
    mentionSpam: false,
    mentionSpamLimit: 5,
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
    updatedAt: new Date().toISOString(),
  };
}

/** Etiquetas UI de filtros detonados (también en reason del Warn). */
export const AUTO_MOD_FILTER_LABELS = {
  zalgo: "Zalgo",
  excessCaps: "Exceso de mayúsculas",
  bannedWords: "Palabras prohibidas",
  antiLinks: "Anti-Links",
  messageSpam: "Spam de mensajes",
  repeatedText: "Texto repetido",
  mentionSpam: "Spam de menciones",
} as const;

export type AutoModFilterKey = keyof typeof AUTO_MOD_FILTER_LABELS;
