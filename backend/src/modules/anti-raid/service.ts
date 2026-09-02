import { eq } from "drizzle-orm";
import type {
  AntiRaidConfigResponse,
  AntiRaidSettings,
  LockdownOverwriteSnapshot,
  UpdateAntiRaidSettingsRequest,
} from "@adobos/shared";
import {
  clampAccountAgeDays,
  clampJoinCount,
  clampRaidTimeoutSeconds,
  clampRaidWindowSeconds,
  defaultAntiRaidSettings,
  isNukePunishment,
  isRaidAgeAction,
  isRaidJoinAction,
  isRaidLockdownJoinAction,
  normalizeIdList,
  featureLockedMessage,
  normalizeNukeThresholds,
} from "@adobos/shared";
import {
  can,
  EntitlementError,
  getGuildTier,
} from "../../core/entitlements/service.js";
import { getDb, one } from "../../db/client.js";
import {
  antiRaidSettings,
  guildSettings,
  type AntiRaidSettingsRow,
} from "../../db/schema.js";

export class AntiRaidError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AntiRaidError";
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new AntiRaidError("Falta guildId.", 400, "MISSING_GUILD_ID");
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(
    getDb()
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existing) {
    await getDb().insert(guildSettings).values({
      guildId,
      prefix: "!",
      welcomeEnabled: false,
      updatedAt: new Date(),
    });
  }
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function mapSettings(
  guildId: string,
  row: AntiRaidSettingsRow | undefined,
): AntiRaidSettings {
  if (!row) return defaultAntiRaidSettings(guildId);
  return {
    guildId,
    enabled: row.enabled,
    alertChannelId: row.alertChannelId,
    joinFloodEnabled: row.joinFloodEnabled,
    joinCount: clampJoinCount(row.joinCount),
    joinWindowSeconds: clampRaidWindowSeconds(row.joinWindowSeconds),
    joinAction: isRaidJoinAction(row.joinAction) ? row.joinAction : "kick",
    accountAgeEnabled: row.accountAgeEnabled,
    accountAgeDays: clampAccountAgeDays(row.accountAgeDays),
    accountAgeAction: isRaidAgeAction(row.accountAgeAction)
      ? row.accountAgeAction
      : "kick",
    lockdownJoinAction: isRaidLockdownJoinAction(row.lockdownJoinAction)
      ? row.lockdownJoinAction
      : "timeout",
    timeoutSeconds: clampRaidTimeoutSeconds(row.timeoutSeconds),
    whitelistRoleIds: normalizeIdList(parseJson(row.whitelistRoleIds) ?? []),
    nukeEnabled: row.nukeEnabled,
    nukeWindowSeconds: clampRaidWindowSeconds(row.nukeWindowSeconds),
    nukePunishment: isNukePunishment(row.nukePunishment)
      ? row.nukePunishment
      : "strip",
    nukeThresholds: normalizeNukeThresholds(parseJson(row.nukeThresholds)),
    nukeWhitelistUserIds: normalizeIdList(
      parseJson(row.nukeWhitelistUserIds) ?? [],
    ),
    nukeWhitelistRoleIds: normalizeIdList(
      parseJson(row.nukeWhitelistRoleIds) ?? [],
    ),
    lockdownActive: row.lockdownActive,
    lockdownStartedAt: row.lockdownStartedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getAntiRaidSettings(
  guildId?: string,
): Promise<AntiRaidSettings> {
  const id = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(antiRaidSettings)
      .where(eq(antiRaidSettings.guildId, id))
      .limit(1),
  );
  return mapSettings(id, row);
}

export async function getAntiRaidConfig(
  guildId?: string,
): Promise<AntiRaidConfigResponse> {
  const id = resolveGuildId(guildId);
  const settings = await getAntiRaidSettings(id);
  return {
    settings,
    nukeAvailable: await can(id, "antinuke"),
  };
}

export async function updateAntiRaidSettings(
  input: UpdateAntiRaidSettingsRequest,
  guildId?: string,
): Promise<AntiRaidSettings> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const current = await getAntiRaidSettings(id);
  const nukeOk = await can(id, "antinuke");

  const next: AntiRaidSettings = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    alertChannelId:
      input.alertChannelId === undefined
        ? current.alertChannelId
        : input.alertChannelId,
    joinFloodEnabled: input.joinFloodEnabled ?? current.joinFloodEnabled,
    joinCount:
      input.joinCount === undefined
        ? current.joinCount
        : clampJoinCount(input.joinCount),
    joinWindowSeconds:
      input.joinWindowSeconds === undefined
        ? current.joinWindowSeconds
        : clampRaidWindowSeconds(input.joinWindowSeconds),
    joinAction:
      input.joinAction === undefined
        ? current.joinAction
        : isRaidJoinAction(input.joinAction)
          ? input.joinAction
          : current.joinAction,
    accountAgeEnabled: input.accountAgeEnabled ?? current.accountAgeEnabled,
    accountAgeDays:
      input.accountAgeDays === undefined
        ? current.accountAgeDays
        : clampAccountAgeDays(input.accountAgeDays),
    accountAgeAction:
      input.accountAgeAction === undefined
        ? current.accountAgeAction
        : isRaidAgeAction(input.accountAgeAction)
          ? input.accountAgeAction
          : current.accountAgeAction,
    lockdownJoinAction:
      input.lockdownJoinAction === undefined
        ? current.lockdownJoinAction
        : isRaidLockdownJoinAction(input.lockdownJoinAction)
          ? input.lockdownJoinAction
          : current.lockdownJoinAction,
    timeoutSeconds:
      input.timeoutSeconds === undefined
        ? current.timeoutSeconds
        : clampRaidTimeoutSeconds(input.timeoutSeconds),
    whitelistRoleIds:
      input.whitelistRoleIds === undefined
        ? current.whitelistRoleIds
        : normalizeIdList(input.whitelistRoleIds),
    nukeEnabled: current.nukeEnabled,
    nukeWindowSeconds: current.nukeWindowSeconds,
    nukePunishment: current.nukePunishment,
    nukeThresholds: current.nukeThresholds,
    nukeWhitelistUserIds: current.nukeWhitelistUserIds,
    nukeWhitelistRoleIds: current.nukeWhitelistRoleIds,
    lockdownActive: current.lockdownActive,
    lockdownStartedAt: current.lockdownStartedAt,
    updatedAt: current.updatedAt,
  };

  if (nukeOk) {
    next.nukeEnabled = input.nukeEnabled ?? current.nukeEnabled;
    next.nukeWindowSeconds =
      input.nukeWindowSeconds === undefined
        ? current.nukeWindowSeconds
        : clampRaidWindowSeconds(input.nukeWindowSeconds);
    next.nukePunishment =
      input.nukePunishment === undefined
        ? current.nukePunishment
        : isNukePunishment(input.nukePunishment)
          ? input.nukePunishment
          : current.nukePunishment;
    next.nukeThresholds =
      input.nukeThresholds === undefined
        ? current.nukeThresholds
        : normalizeNukeThresholds({
            ...current.nukeThresholds,
            ...input.nukeThresholds,
          });
    next.nukeWhitelistUserIds =
      input.nukeWhitelistUserIds === undefined
        ? current.nukeWhitelistUserIds
        : normalizeIdList(input.nukeWhitelistUserIds);
    next.nukeWhitelistRoleIds =
      input.nukeWhitelistRoleIds === undefined
        ? current.nukeWhitelistRoleIds
        : normalizeIdList(input.nukeWhitelistRoleIds);
  } else if (
    input.nukeEnabled === true ||
    input.nukePunishment !== undefined ||
    input.nukeThresholds !== undefined
  ) {
    const tier = await getGuildTier(id);
    throw new EntitlementError(
      featureLockedMessage(tier, "antinuke"),
      403,
      "FEATURE_LOCKED",
      "antinuke",
    );
  }

  const now = new Date();
  await getDb()
    .insert(antiRaidSettings)
    .values({
      guildId: id,
      enabled: next.enabled,
      alertChannelId: next.alertChannelId,
      joinFloodEnabled: next.joinFloodEnabled,
      joinCount: next.joinCount,
      joinWindowSeconds: next.joinWindowSeconds,
      joinAction: next.joinAction,
      accountAgeEnabled: next.accountAgeEnabled,
      accountAgeDays: next.accountAgeDays,
      accountAgeAction: next.accountAgeAction,
      lockdownJoinAction: next.lockdownJoinAction,
      timeoutSeconds: next.timeoutSeconds,
      whitelistRoleIds: JSON.stringify(next.whitelistRoleIds),
      nukeEnabled: next.nukeEnabled,
      nukeWindowSeconds: next.nukeWindowSeconds,
      nukePunishment: next.nukePunishment,
      nukeThresholds: JSON.stringify(next.nukeThresholds),
      nukeWhitelistUserIds: JSON.stringify(next.nukeWhitelistUserIds),
      nukeWhitelistRoleIds: JSON.stringify(next.nukeWhitelistRoleIds),
      lockdownActive: current.lockdownActive,
      lockdownStartedAt: current.lockdownStartedAt
        ? new Date(current.lockdownStartedAt)
        : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: antiRaidSettings.guildId,
      set: {
        enabled: next.enabled,
        alertChannelId: next.alertChannelId,
        joinFloodEnabled: next.joinFloodEnabled,
        joinCount: next.joinCount,
        joinWindowSeconds: next.joinWindowSeconds,
        joinAction: next.joinAction,
        accountAgeEnabled: next.accountAgeEnabled,
        accountAgeDays: next.accountAgeDays,
        accountAgeAction: next.accountAgeAction,
        lockdownJoinAction: next.lockdownJoinAction,
        timeoutSeconds: next.timeoutSeconds,
        whitelistRoleIds: JSON.stringify(next.whitelistRoleIds),
        nukeEnabled: next.nukeEnabled,
        nukeWindowSeconds: next.nukeWindowSeconds,
        nukePunishment: next.nukePunishment,
        nukeThresholds: JSON.stringify(next.nukeThresholds),
        nukeWhitelistUserIds: JSON.stringify(next.nukeWhitelistUserIds),
        nukeWhitelistRoleIds: JSON.stringify(next.nukeWhitelistRoleIds),
        updatedAt: now,
      },
    });

  return getAntiRaidSettings(id);
}

export async function getLockdownSnapshot(
  guildId: string,
): Promise<LockdownOverwriteSnapshot[]> {
  const row = await one(
    getDb()
      .select({ snapshot: antiRaidSettings.lockdownSnapshot })
      .from(antiRaidSettings)
      .where(eq(antiRaidSettings.guildId, guildId))
      .limit(1),
  );
  const parsed = parseJson(row?.snapshot);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is LockdownOverwriteSnapshot =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as LockdownOverwriteSnapshot).channelId === "string",
  );
}

export async function setLockdownState(input: {
  guildId: string;
  active: boolean;
  byUserId: string | null;
  snapshot: LockdownOverwriteSnapshot[];
}): Promise<AntiRaidSettings> {
  await ensureGuildRow(input.guildId);
  const now = new Date();
  const current = await getAntiRaidSettings(input.guildId);
  await getDb()
    .insert(antiRaidSettings)
    .values({
      guildId: input.guildId,
      enabled: current.enabled,
      alertChannelId: current.alertChannelId,
      joinFloodEnabled: current.joinFloodEnabled,
      joinCount: current.joinCount,
      joinWindowSeconds: current.joinWindowSeconds,
      joinAction: current.joinAction,
      accountAgeEnabled: current.accountAgeEnabled,
      accountAgeDays: current.accountAgeDays,
      accountAgeAction: current.accountAgeAction,
      lockdownJoinAction: current.lockdownJoinAction,
      timeoutSeconds: current.timeoutSeconds,
      whitelistRoleIds: JSON.stringify(current.whitelistRoleIds),
      nukeEnabled: current.nukeEnabled,
      nukeWindowSeconds: current.nukeWindowSeconds,
      nukePunishment: current.nukePunishment,
      nukeThresholds: JSON.stringify(current.nukeThresholds),
      nukeWhitelistUserIds: JSON.stringify(current.nukeWhitelistUserIds),
      nukeWhitelistRoleIds: JSON.stringify(current.nukeWhitelistRoleIds),
      lockdownActive: input.active,
      lockdownStartedAt: input.active ? now : null,
      lockdownByUserId: input.active ? input.byUserId : null,
      lockdownSnapshot: JSON.stringify(input.snapshot),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: antiRaidSettings.guildId,
      set: {
        lockdownActive: input.active,
        lockdownStartedAt: input.active ? now : null,
        lockdownByUserId: input.active ? input.byUserId : null,
        lockdownSnapshot: JSON.stringify(input.snapshot),
        updatedAt: now,
      },
    });
  return getAntiRaidSettings(input.guildId);
}
