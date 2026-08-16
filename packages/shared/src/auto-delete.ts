/** Contratos Auto-delete — borrado automático por canal. */

export type AutoDeleteDelayUnit = "seconds" | "minutes" | "hours";

export type AutoDeleteFilterType = "all" | "bots_only" | "no_attachments";

export interface AutoDeleteRule {
  channelId: string;
  delayValue: number;
  delayUnit: AutoDeleteDelayUnit;
  filterType: AutoDeleteFilterType;
}

export interface AutoDeleteConfig {
  guildId: string;
  /** Master switch del módulo. */
  enabled: boolean;
  rules: AutoDeleteRule[];
  updatedAt: string;
}

export interface AutoDeleteConfigResponse {
  config: AutoDeleteConfig;
}

export type UpdateAutoDeleteConfigRequest = Partial<{
  enabled: boolean;
  rules: AutoDeleteRule[];
}>;

export const AUTO_DELETE_DELAY_UNITS: AutoDeleteDelayUnit[] = [
  "seconds",
  "minutes",
  "hours",
];

export const AUTO_DELETE_FILTER_TYPES: AutoDeleteFilterType[] = [
  "all",
  "bots_only",
  "no_attachments",
];

export function defaultAutoDeleteConfig(guildId = ""): AutoDeleteConfig {
  return {
    guildId,
    enabled: false,
    rules: [],
    updatedAt: new Date().toISOString(),
  };
}

export function delayToMs(value: number, unit: AutoDeleteDelayUnit): number {
  const n = Math.max(0, Number(value) || 0);
  if (unit === "minutes") return n * 60_000;
  if (unit === "hours") return n * 3_600_000;
  return n * 1_000;
}

export function normalizeAutoDeleteDelayUnit(
  value: unknown,
): AutoDeleteDelayUnit {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "minutes" || raw === "minutos" || raw === "m") return "minutes";
  if (raw === "hours" || raw === "horas" || raw === "h") return "hours";
  return "seconds";
}

export function normalizeAutoDeleteFilterType(
  value: unknown,
): AutoDeleteFilterType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "bots_only" || raw === "bots" || raw === "solo_bots") {
    return "bots_only";
  }
  if (
    raw === "no_attachments" ||
    raw === "text_only" ||
    raw === "sin_adjuntos"
  ) {
    return "no_attachments";
  }
  return "all";
}
