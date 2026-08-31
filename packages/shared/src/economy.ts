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

export function clampStartBalance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
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
  };
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
