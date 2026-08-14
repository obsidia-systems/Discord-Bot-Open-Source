import type {
  DiscordAuditChangeItem,
  DiscordAuditEntry,
  DiscordAuditRoleKind,
  DiscordAuditRoleRef,
  DiscordAuditTone,
} from "@adobos/shared";

const ROLE_WINDOW_MS = 15_000;

function isMemberRoleUpdate(entry: DiscordAuditEntry): boolean {
  return (
    entry.actionKey === "MemberRoleUpdate" ||
    entry.roleKind != null ||
    (entry.addedRoles?.length ?? 0) > 0 ||
    (entry.removedRoles?.length ?? 0) > 0
  );
}

function parseLegacyRoleList(raw: string): DiscordAuditRoleRef[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => ({ id: name, name, color: "#000000" }));
}

function rolesFromEntry(entry: DiscordAuditEntry): {
  added: DiscordAuditRoleRef[];
  removed: DiscordAuditRoleRef[];
} {
  const added = [...(entry.addedRoles ?? [])];
  const removed = [...(entry.removedRoles ?? [])];

  if (added.length === 0 && removed.length === 0) {
    for (const change of entry.changes) {
      if (change.key === "$add" && change.newValue) {
        added.push(...parseLegacyRoleList(change.newValue));
      }
      if (change.key === "$remove") {
        const raw = change.oldValue || change.newValue;
        if (raw) {
          removed.push(...parseLegacyRoleList(raw));
        }
      }
    }
  }

  return { added, removed };
}

function uniqueById(roles: DiscordAuditRoleRef[]): DiscordAuditRoleRef[] {
  const map = new Map<string, DiscordAuditRoleRef>();
  for (const role of roles) {
    if (!map.has(role.id)) map.set(role.id, role);
  }
  return [...map.values()];
}

function classifyRoles(
  added: DiscordAuditRoleRef[],
  removed: DiscordAuditRoleRef[],
): {
  roleKind: DiscordAuditRoleKind;
  actionLabel: string;
  tone: DiscordAuditTone;
} {
  if (added.length > 0 && removed.length === 0) {
    return {
      roleKind: "ROLE_ADD",
      actionLabel: "Roles añadidos",
      tone: "create",
    };
  }
  if (removed.length > 0 && added.length === 0) {
    return {
      roleKind: "ROLE_REMOVE",
      actionLabel: "Roles eliminados",
      tone: "delete",
    };
  }
  return {
    roleKind: "ROLE_UPDATE",
    actionLabel: "Actualización de roles",
    tone: "update",
  };
}

function buildRoleChanges(
  added: DiscordAuditRoleRef[],
  removed: DiscordAuditRoleRef[],
): DiscordAuditChangeItem[] {
  const changes: DiscordAuditChangeItem[] = [];
  if (added.length > 0) {
    const names = added.map((role) => role.name);
    changes.push({
      key: "$add",
      summary: `Añadió: ${names.join(", ")}`,
      newValue: names.join(", "),
    });
  }
  if (removed.length > 0) {
    const names = removed.map((role) => role.name);
    changes.push({
      key: "$remove",
      summary: `Quitó: ${names.join(", ")}`,
      oldValue: names.join(", "),
    });
  }
  return changes;
}

function canMergeRolePair(
  a: DiscordAuditEntry,
  b: DiscordAuditEntry,
): boolean {
  if (!isMemberRoleUpdate(b)) return false;
  if ((a.executor?.id ?? "") !== (b.executor?.id ?? "")) return false;
  if ((a.target.id ?? "") !== (b.target.id ?? "")) return false;
  if (!a.target.id || !b.target.id) return false;

  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= ROLE_WINDOW_MS;
}

function mergeRoleGroup(group: DiscordAuditEntry[]): DiscordAuditEntry {
  const addedMap = new Map<string, DiscordAuditRoleRef>();
  const removedMap = new Map<string, DiscordAuditRoleRef>();
  const reasons: string[] = [];

  for (const entry of group) {
    const roles = rolesFromEntry(entry);
    for (const role of roles.added) addedMap.set(role.id, role);
    for (const role of roles.removed) removedMap.set(role.id, role);
    if (entry.reason?.trim()) reasons.push(entry.reason.trim());
  }

  // Conservar añadidos y eliminados aunque sea el mismo rol (p. ej. toggle
  // Azul): Discord y Action Logs muestran ambos; no vaciar el Sheet.

  const added = uniqueById([...addedMap.values()]);
  const removed = uniqueById([...removedMap.values()]);
  const classified = classifyRoles(added, removed);
  const anchor = group[0]!;
  const sourceIds = group.flatMap((entry) => entry.sourceIds ?? [entry.id]);
  const changes = buildRoleChanges(added, removed);
  const summaryParts = [
    ...changes.map((change) => change.summary),
    reasons[0] ? `Razón: ${reasons[0]}` : null,
  ].filter(Boolean) as string[];

  return {
    ...anchor,
    id: sourceIds.join("+"),
    sourceIds,
    consolidatedCount: sourceIds.length,
    addedRoles: added,
    removedRoles: removed,
    roleKind: classified.roleKind,
    actionLabel: classified.actionLabel,
    tone: classified.tone,
    actionKey: "MemberRoleUpdate",
    category: "members",
    reason: reasons[0] ?? null,
    changes,
    changesSummary:
      summaryParts.length > 0 ? summaryParts.join(" · ") : "—",
  };
}

/**
 * Agrupa MemberRoleUpdate consecutivos (misma ventana ≤15s, mismo ejecutor/target).
 * Otros eventos pasan intactos. No mezcla tipos distintos.
 */
export function consolidateAuditLogs(
  rawLogs: DiscordAuditEntry[],
): DiscordAuditEntry[] {
  const result: DiscordAuditEntry[] = [];
  let index = 0;

  while (index < rawLogs.length) {
    const current = rawLogs[index]!;

    if (!isMemberRoleUpdate(current)) {
      result.push(current);
      index += 1;
      continue;
    }

    const group: DiscordAuditEntry[] = [current];
    let cursor = index + 1;
    while (cursor < rawLogs.length) {
      const next = rawLogs[cursor]!;
      const previous = group[group.length - 1]!;
      if (!canMergeRolePair(previous, next)) break;
      group.push(next);
      cursor += 1;
    }

    result.push(mergeRoleGroup(group));
    index = cursor;
  }

  return result;
}
