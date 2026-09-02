/** Configuración base y leaderboard de Economía. */

export interface EconomyConfig {
  guildId: string;
  isActive: boolean;
  currencyName: string;
  currencySymbol: string;
  startBalance: number;
  /** Comisión % en /pay (0–100). */
  transferTax: number;
}

export function defaultEconomyConfig(guildId = ""): EconomyConfig {
  return {
    guildId,
    isActive: false,
    currencyName: "Adobos Coins",
    currencySymbol: "🪙",
    startBalance: 0,
    transferTax: 0,
  };
}

export interface EconomyConfigResponse {
  config: EconomyConfig;
}

export type UpdateEconomyConfigRequest = Partial<{
  isActive: boolean;
  currencyName: string;
  currencySymbol: string;
  startBalance: number;
  transferTax: number;
  guildId: string;
}>;

export interface EconomyLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  wallet: number;
  bank: number;
  total: number;
}

export interface EconomyLeaderboardResponse {
  entries: EconomyLeaderboardEntry[];
  total: number;
}

export type EconomyFundAction = "add" | "remove" | "set";

export interface AdjustEconomyFundsRequest {
  userId: string;
  /** Destino del ajuste. */
  target: "wallet" | "bank";
  action: EconomyFundAction;
  /** Cantidad positiva. Para `set` es el valor absoluto. */
  amount: number;
  guildId?: string;
}

export interface AdjustEconomyFundsResponse {
  ok: true;
  userId: string;
  wallet: number;
  bank: number;
  total: number;
}

export function clampTransferTax(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Techo de wallet/bank. Bajo el máximo de `integer` en Postgres. */
export const MAX_ECONOMY_BALANCE = 2_000_000_000;

export function clampEconomyBalance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_ECONOMY_BALANCE, Math.max(0, Math.floor(value)));
}

export function clampStartBalance(value: number): number {
  return clampEconomyBalance(value);
}

/** Comisión de `/pay`: `tax` se destruye, `received` llega al destino. */
export function computePayTax(
  amount: number,
  taxPercent: number,
): { sent: number; tax: number; received: number } {
  const sent = Math.max(0, Math.floor(amount));
  const tax = Math.min(
    sent,
    Math.floor((sent * clampTransferTax(taxPercent)) / 100),
  );
  return { sent, tax, received: sent - tax };
}

/**
 * `all`/`todo`/`max` → `"all"`. Entero ≥ 1. `null` si vacío o inválido.
 */
export function parseBankAmount(raw: string): number | "all" | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "all" || value === "todo" || value === "max") return "all";
  const cleaned = value.replace(/[,\s_]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return Math.floor(n);
}

/* ─── Ingresos / Trabajos / Crímenes ─── */

export type EconomyRoleSalaryFrequency = "daily" | "weekly";

export interface EconomyRoleSalary {
  id: string;
  roleId: string;
  amount: number;
  frequency: EconomyRoleSalaryFrequency;
}

export interface EconomyJob {
  id: string;
  name: string;
  minPay: number;
  maxPay: number;
  /** Cooldown del empleo en minutos. */
  cooldownMinutes: number;
  /** Placeholders: `{job}`, `{payout}`, `{currency}`. */
  successMessage: string;
}

export interface EconomyCrime {
  id: string;
  name: string;
  /** Probabilidad de éxito 0–100. */
  successChance: number;
  minReward: number;
  maxReward: number;
  minFine: number;
  maxFine: number;
  /** Cooldown del crimen en minutos. */
  cooldownMinutes: number;
  /** Placeholders: `{crime}`, `{payout}`, `{fine}`, `{currency}`. */
  successMessage: string;
  failMessage: string;
}

/** `/rob` — apagado por defecto. Solo roba cartera, nunca banco. */
export interface EconomyRobConfig {
  enabled: boolean;
  /** Probabilidad de éxito 0–100. */
  successChance: number;
  cooldownMinutes: number;
  /** La víctima necesita al menos esto en cartera. */
  minTargetWallet: number;
  /** % de la cartera de la víctima (éxito). */
  minStealPercent: number;
  maxStealPercent: number;
  /** % de la cartera del ladrón (falla). */
  failFinePercent: number;
}

export interface EconomyIncomeConfig {
  guildId: string;
  dailyPay: number;
  weeklyPay: number;
  monthlyPay: number;
  streakEnabled: boolean;
  /** Bonus % por día de racha (si streakEnabled). */
  streakBonusPercent: number;
  roleSalaries: EconomyRoleSalary[];
  jobs: EconomyJob[];
  crimes: EconomyCrime[];
  rob: EconomyRobConfig;
}

export interface EconomyIncomeConfigResponse {
  config: EconomyIncomeConfig;
}

export type UpdateEconomyIncomeRequest = Partial<
  Omit<EconomyIncomeConfig, "guildId">
> & { guildId?: string };

export function defaultEconomyJob(partial?: Partial<EconomyJob>): EconomyJob {
  return {
    id: partial?.id ?? "",
    name: partial?.name ?? "Minero",
    minPay: partial?.minPay ?? 50,
    maxPay: partial?.maxPay ?? 150,
    cooldownMinutes: partial?.cooldownMinutes ?? 60,
    successMessage:
      partial?.successMessage ??
      "Trabajaste de {job} y ganaste {payout} {currency}.",
  };
}

export function defaultEconomyCrime(
  partial?: Partial<EconomyCrime>,
): EconomyCrime {
  return {
    id: partial?.id ?? "",
    name: partial?.name ?? "Robar un banco",
    successChance: partial?.successChance ?? 40,
    minReward: partial?.minReward ?? 100,
    maxReward: partial?.maxReward ?? 400,
    minFine: partial?.minFine ?? 50,
    maxFine: partial?.maxFine ?? 200,
    cooldownMinutes: partial?.cooldownMinutes ?? 60,
    successMessage:
      partial?.successMessage ??
      "¡Éxito! Completaste «{crime}» y escapaste con {payout} {currency}.",
    failMessage:
      partial?.failMessage ??
      "Te atraparon en «{crime}». Multa de {fine} {currency}.",
  };
}

export function defaultEconomyRob(): EconomyRobConfig {
  return {
    enabled: false,
    successChance: 40,
    cooldownMinutes: 30,
    minTargetWallet: 100,
    minStealPercent: 10,
    maxStealPercent: 25,
    failFinePercent: 10,
  };
}

export function defaultEconomyIncomeConfig(guildId = ""): EconomyIncomeConfig {
  return {
    guildId,
    dailyPay: 100,
    weeklyPay: 500,
    monthlyPay: 2000,
    streakEnabled: false,
    streakBonusPercent: 5,
    roleSalaries: [],
    jobs: [],
    crimes: [],
    rob: defaultEconomyRob(),
  };
}

/**
 * 1 oficio → se ejecuta solo. 2–5 → el usuario elige. 6+ → aleatorio.
 */
export function incomeChoiceMode(count: number): "auto" | "select" | "random" {
  if (count <= 1) return "auto";
  if (count <= 5) return "select";
  return "random";
}

export function clampNonNegInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Garantiza min ≤ max; intercambia si hace falta. */
export function normalizeMinMax(
  min: number,
  max: number,
): { min: number; max: number } {
  const a = clampNonNegInt(min);
  const b = clampNonNegInt(max);
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

export function applyEconomyMessageTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}
