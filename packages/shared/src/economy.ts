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
