import type {
  EconomyCrime,
  EconomyIncomeConfig,
  EconomyJob,
  EconomyRobConfig,
  EconomyRoleSalary,
  UpdateEconomyIncomeRequest,
} from "@adobos/shared";
import {
  clampNonNegInt,
  clampPercent,
  defaultEconomyIncomeConfig,
  defaultEconomyRob,
  normalizeMinMax,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import { economyIncome, guildSettings } from "../../db/schema.js";
import { EconomyError } from "./service.js";

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new EconomyError(
      "Missing guildId.",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1));
  if (!existing) {
    await getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
  }
}

function parseJsonArray<T>(raw: string | null | undefined, fallback: T[]): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function sanitizeRoleSalaries(raw: unknown): EconomyRoleSalary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): EconomyRoleSalary | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const roleId = typeof row.roleId === "string" ? row.roleId.trim() : "";
      if (!roleId) return null;
      const frequency =
        row.frequency === "weekly" ? ("weekly" as const) : ("daily" as const);
      return {
        id:
          typeof row.id === "string" && row.id.trim()
            ? row.id.trim()
            : newId(),
        roleId,
        amount: clampNonNegInt(Number(row.amount)),
        frequency,
      };
    })
    .filter((x): x is EconomyRoleSalary => x !== null)
    .slice(0, 50);
}

function sanitizeJobs(raw: unknown): EconomyJob[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): EconomyJob | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name =
        typeof row.name === "string" ? row.name.trim().slice(0, 64) : "";
      if (!name) return null;
      const pay = normalizeMinMax(Number(row.minPay), Number(row.maxPay));
      const successMessage =
        typeof row.successMessage === "string" && row.successMessage.trim()
          ? row.successMessage.trim().slice(0, 500)
          : "You worked as {job} and earned {payout} {currency}.";
      return {
        id:
          typeof row.id === "string" && row.id.trim()
            ? row.id.trim()
            : newId(),
        name,
        minPay: pay.min,
        maxPay: pay.max,
        cooldownMinutes: Math.min(
          10080,
          Math.max(1, clampNonNegInt(Number(row.cooldownMinutes), 60)),
        ),
        successMessage,
      };
    })
    .filter((x): x is EconomyJob => x !== null)
    .slice(0, 40);
}

function sanitizeCrimes(raw: unknown): EconomyCrime[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): EconomyCrime | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name =
        typeof row.name === "string" ? row.name.trim().slice(0, 64) : "";
      if (!name) return null;
      const reward = normalizeMinMax(
        Number(row.minReward),
        Number(row.maxReward),
      );
      const fine = normalizeMinMax(Number(row.minFine), Number(row.maxFine));
      const successMessage =
        typeof row.successMessage === "string" && row.successMessage.trim()
          ? row.successMessage.trim().slice(0, 500)
          : "Success! You pulled off «{crime}» and got away with {payout} {currency}.";
      const failMessage =
        typeof row.failMessage === "string" && row.failMessage.trim()
          ? row.failMessage.trim().slice(0, 500)
          : "You got caught during «{crime}». Fine of {fine} {currency}.";
      return {
        id:
          typeof row.id === "string" && row.id.trim()
            ? row.id.trim()
            : newId(),
        name,
        successChance: clampPercent(Number(row.successChance)),
        minReward: reward.min,
        maxReward: reward.max,
        minFine: fine.min,
        maxFine: fine.max,
        cooldownMinutes: Math.min(
          10080,
          Math.max(1, clampNonNegInt(Number(row.cooldownMinutes), 60)),
        ),
        successMessage,
        failMessage,
      };
    })
    .filter((x): x is EconomyCrime => x !== null)
    .slice(0, 40);
}

function sanitizeRob(raw: unknown): EconomyRobConfig {
  const base = defaultEconomyRob();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  const steal = normalizeMinMax(
    clampPercent(Number(row.minStealPercent ?? base.minStealPercent)),
    clampPercent(Number(row.maxStealPercent ?? base.maxStealPercent)),
  );
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
    successChance: clampPercent(
      Number(row.successChance ?? base.successChance),
    ),
    cooldownMinutes: Math.min(
      10080,
      Math.max(1, clampNonNegInt(Number(row.cooldownMinutes), base.cooldownMinutes)),
    ),
    minTargetWallet: clampNonNegInt(
      Number(row.minTargetWallet ?? base.minTargetWallet),
    ),
    minStealPercent: steal.min,
    maxStealPercent: steal.max,
    failFinePercent: clampPercent(
      Number(row.failFinePercent ?? base.failFinePercent),
    ),
  };
}

function rowToConfig(
  guildId: string,
  row: typeof economyIncome.$inferSelect | undefined,
): EconomyIncomeConfig {
  if (!row) return defaultEconomyIncomeConfig(guildId);
  return {
    guildId: row.guildId,
    dailyPay: row.dailyPay,
    weeklyPay: row.weeklyPay,
    monthlyPay: row.monthlyPay,
    streakEnabled: row.streakEnabled,
    streakBonusPercent: row.streakBonusPercent,
    roleSalaries: sanitizeRoleSalaries(
      parseJsonArray(row.roleSalaries, []),
    ),
    jobs: sanitizeJobs(parseJsonArray(row.jobs, [])),
    crimes: sanitizeCrimes(parseJsonArray(row.crimes, [])),
    rob: sanitizeRob(parseJsonObject(row.rob)),
  };
}

export async function getEconomyIncomeConfig(guildId?: string): Promise<EconomyIncomeConfig> {
  const id = resolveGuildId(guildId);
  const row = await one(getDb()
    .select()
    .from(economyIncome)
    .where(eq(economyIncome.guildId, id))
    .limit(1));
  return await rowToConfig(id, row);
}

export async function updateEconomyIncomeConfig(
  input: UpdateEconomyIncomeRequest,
): Promise<EconomyIncomeConfig> {
  const id = resolveGuildId(input.guildId);
  await ensureGuildRow(id);
  const current = await getEconomyIncomeConfig(id);

  const next: EconomyIncomeConfig = {
    guildId: id,
    dailyPay:
      typeof input.dailyPay === "number"
        ? clampNonNegInt(input.dailyPay)
        : current.dailyPay,
    weeklyPay:
      typeof input.weeklyPay === "number"
        ? clampNonNegInt(input.weeklyPay)
        : current.weeklyPay,
    monthlyPay:
      typeof input.monthlyPay === "number"
        ? clampNonNegInt(input.monthlyPay)
        : current.monthlyPay,
    streakEnabled:
      typeof input.streakEnabled === "boolean"
        ? input.streakEnabled
        : current.streakEnabled,
    streakBonusPercent:
      typeof input.streakBonusPercent === "number"
        ? clampPercent(input.streakBonusPercent)
        : current.streakBonusPercent,
    roleSalaries:
      input.roleSalaries !== undefined
        ? sanitizeRoleSalaries(input.roleSalaries)
        : current.roleSalaries,
    jobs: input.jobs !== undefined ? sanitizeJobs(input.jobs) : current.jobs,
    crimes:
      input.crimes !== undefined
        ? sanitizeCrimes(input.crimes)
        : current.crimes,
    rob: input.rob !== undefined ? sanitizeRob(input.rob) : current.rob,
  };

  const now = new Date();
  await getDb()
    .insert(economyIncome)
    .values({
      guildId: id,
      dailyPay: next.dailyPay,
      weeklyPay: next.weeklyPay,
      monthlyPay: next.monthlyPay,
      streakEnabled: next.streakEnabled,
      streakBonusPercent: next.streakBonusPercent,
      roleSalaries: JSON.stringify(next.roleSalaries),
      jobs: JSON.stringify(next.jobs),
      crimes: JSON.stringify(next.crimes),
      rob: JSON.stringify(next.rob),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: economyIncome.guildId,
      set: {
        dailyPay: next.dailyPay,
        weeklyPay: next.weeklyPay,
        monthlyPay: next.monthlyPay,
        streakEnabled: next.streakEnabled,
        streakBonusPercent: next.streakBonusPercent,
        roleSalaries: JSON.stringify(next.roleSalaries),
        jobs: JSON.stringify(next.jobs),
        crimes: JSON.stringify(next.crimes),
        rob: JSON.stringify(next.rob),
        updatedAt: now,
      },
    })
    ;

  return next;
}
