import type {
  AuditLogEvent,
  Client,
  Guild,
  GuildAuditLogsEntry,
} from "discord.js";
import { BoundedTtlMap } from "../../core/cache/boundedTtlMap.js";
import { userTag } from "./helpers.js";

/** Entradas de audit más viejas que esto no se usan como ejecutor. */
export const AUDIT_RECENCY_MS = 5_000;

export interface AuditExecutor {
  id: string;
  tag: string;
  bot: boolean;
  roleIds: string[];
  avatarURL: string | null;
}

export interface CachedAuditEntry {
  guildId: string;
  action: number;
  targetId: string | null;
  createdTimestamp: number;
  executor: Omit<AuditExecutor, "roleIds"> | null;
}

export interface BotDeleteHint {
  executor: Omit<AuditExecutor, "roleIds">;
  source: "auto-delete";
}

const recentAudit = new BoundedTtlMap<string, CachedAuditEntry>(8_000, 10_000);
const botMessageDeletes = new BoundedTtlMap<string, BotDeleteHint>(
  8_000,
  20_000,
);

function botDeleteKey(guildId: string, messageId: string): string {
  return `${guildId}:msg:${messageId}`;
}

/** El bot va a borrar estos mensajes: action-logs no espera al Audit Log. */
export function rememberBotMessageDeletes(
  client: Client,
  guildId: string,
  messageIds: Iterable<string>,
  source: BotDeleteHint["source"] = "auto-delete",
): void {
  const user = client.user;
  if (!user) return;
  const executor = {
    id: user.id,
    tag: userTag(user),
    bot: true,
    avatarURL: user.displayAvatarURL({ size: 128 }),
  };
  for (const messageId of messageIds) {
    botMessageDeletes.set(botDeleteKey(guildId, messageId), {
      executor,
      source,
    });
  }
}

export function takeBotMessageDelete(
  guildId: string,
  messageId: string,
): BotDeleteHint | undefined {
  const key = botDeleteKey(guildId, messageId);
  const hint = botMessageDeletes.get(key);
  if (hint) botMessageDeletes.delete(key);
  return hint;
}

function auditCacheKey(
  guildId: string,
  action: number,
  targetId: string | null,
): string {
  return `${guildId}:${action}:${targetId ?? "_"}`;
}

export function rememberAuditEntry(entry: CachedAuditEntry): void {
  recentAudit.set(
    auditCacheKey(entry.guildId, entry.action, entry.targetId),
    entry,
  );
  if (entry.targetId) {
    recentAudit.set(auditCacheKey(entry.guildId, entry.action, null), entry);
  }
}

export function getCachedAuditEntry(
  guildId: string,
  action: number,
  targetId?: string | null,
): CachedAuditEntry | undefined {
  const exact = recentAudit.get(
    auditCacheKey(guildId, action, targetId ?? null),
  );
  if (exact) return exact;
  if (targetId) {
    return recentAudit.get(auditCacheKey(guildId, action, null));
  }
  return undefined;
}

export function clearAuditCache(): void {
  recentAudit.clear();
  botMessageDeletes.clear();
}

export interface PickAuditEntry {
  targetId: string | null;
  createdTimestamp: number;
}

/**
 * Primera entrada reciente. Si hay targetId, prefiere match exacto;
 * si no hay target en el audit (MemberDisconnect), acepta la reciente sin target.
 */
export function pickRecentAuditEntry<T extends PickAuditEntry>(
  entries: T[],
  opts: {
    targetId?: string | null;
    maxAgeMs?: number;
    now?: number;
    allowMissingTarget?: boolean;
  } = {},
): T | undefined {
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? AUDIT_RECENCY_MS;
  const recent = entries.filter((e) => now - e.createdTimestamp < maxAge);
  const want = opts.targetId ?? null;
  if (!want) return recent[0];
  const exact = recent.find((e) => e.targetId === want);
  if (exact) return exact;
  if (opts.allowMissingTarget) {
    return recent.find((e) => !e.targetId);
  }
  return undefined;
}

function targetIdOf(entry: GuildAuditLogsEntry): string | null {
  if (entry.targetId) return entry.targetId;
  const target = entry.target;
  if (target && typeof target === "object" && "id" in target) {
    return String((target as { id: string }).id);
  }
  return null;
}

export function rememberGuildAuditLogEntry(
  guild: Guild,
  entry: GuildAuditLogsEntry,
): void {
  const executor = entry.executor
    ? {
        id: entry.executor.id,
        tag: userTag(entry.executor),
        bot: Boolean(entry.executor.bot),
        avatarURL: entry.executor.displayAvatarURL({ size: 128 }),
      }
    : null;
  rememberAuditEntry({
    guildId: guild.id,
    action: entry.action,
    targetId: targetIdOf(entry),
    createdTimestamp: entry.createdTimestamp,
    executor,
  });
}

async function withRoleIds(
  guild: Guild,
  executor: Omit<AuditExecutor, "roleIds"> | null,
): Promise<AuditExecutor | null> {
  if (!executor) return null;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  return {
    ...executor,
    roleIds: member ? [...member.roles.cache.keys()] : [],
  };
}

/**
 * Ejecutor reciente: caché de guildAuditLogEntryCreate, luego fetch con ventana.
 * Si el audit es viejo, devuelve null (mejor desconocido que el moderador equivocado).
 */
export async function resolveAuditExecutor(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string | null,
  opts: { allowMissingTarget?: boolean } = {},
): Promise<AuditExecutor | null> {
  const cached = getCachedAuditEntry(guild.id, type, targetId);
  if (
    cached?.executor &&
    Date.now() - cached.createdTimestamp < AUDIT_RECENCY_MS
  ) {
    const want = targetId ?? null;
    const cacheHits =
      !want ||
      cached.targetId === want ||
      (!cached.targetId && Boolean(opts.allowMissingTarget));
    if (cacheHits) {
      return withRoleIds(guild, cached.executor);
    }
  }

  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const picked = pickRecentAuditEntry(
      [...logs.entries.values()].map((e) => ({
        entry: e,
        targetId: targetIdOf(e),
        createdTimestamp: e.createdTimestamp,
      })),
      {
        targetId,
        allowMissingTarget: opts.allowMissingTarget,
      },
    )?.entry;
    if (!picked?.executor) return null;
    rememberGuildAuditLogEntry(guild, picked);
    return withRoleIds(guild, {
      id: picked.executor.id,
      tag: userTag(picked.executor),
      bot: Boolean(picked.executor.bot),
      avatarURL: picked.executor.displayAvatarURL({ size: 128 }),
    });
  } catch {
    return null;
  }
}

export async function onGuildAuditLogEntryCreate(
  entry: GuildAuditLogsEntry,
  guild: Guild,
): Promise<void> {
  rememberGuildAuditLogEntry(guild, entry);
}
