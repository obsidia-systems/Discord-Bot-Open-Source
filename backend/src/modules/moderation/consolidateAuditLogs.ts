import type {
  DiscordAuditChangeItem,
  DiscordAuditEntry,
  DiscordAuditRoleKind,
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function rolesFromEntry(entry: DiscordAuditEntry): {
  added: string[];
  removed: string[];
} {
  const added = [...(entry.addedRoles ?? [])];
  const removed = [...(entry.removedRoles ?? [])];

  if (added.length === 0 && removed.length === 0) {
    for (const change of entry.changes) {
      if (change.key === "$add" && change.newValue) {
        added.push(
          ...change.newValue.split(",").map((part) => part.trim()),
        );
      }
      if (change.key === "$remove") {
        const raw = change.oldValue || change.newValue;
        if (raw) {
          removed.push(...raw.split(",").map((part) => part.trim()));
        }
      }
    }
  }

  return { added: unique(added), removed: unique(removed) };
}

function classifyRoles(
  added: string[],
  removed: string[],
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
  added: string[],
  removed: string[],
): DiscordAuditChangeItem[] {
  const changes: DiscordAuditChangeItem[] = [];
  if (added.length > 0) {
    changes.push({
      key: "$add",
      summary: `Añadió: ${added.join(", ")}`,
      newValue: added.join(", "),
    });
  }
  if (removed.length > 0) {
    changes.push({
      key: "$remove",
      summary: `Quitó: ${removed.join(", ")}`,
      oldValue: removed.join(", "),
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
  const addedSet = new Set<string>();
  const removedSet = new Set<string>();
  const reasons: string[] = [];

  for (const entry of group) {
    const roles = rolesFromEntry(entry);
    for (const role of roles.added) addedSet.add(role);
    for (const role of roles.removed) removedSet.add(role);
    if (entry.reason?.trim()) reasons.push(entry.reason.trim());
  }

  // Cancelaciones netas (añadido y quitado en la misma ráfaga).
  for (const role of [...addedSet]) {
    if (removedSet.has(role)) {
      addedSet.delete(role);
      removedSet.delete(role);
    }
  }

  const added = [...addedSet];
  const removed = [...removedSet];
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
