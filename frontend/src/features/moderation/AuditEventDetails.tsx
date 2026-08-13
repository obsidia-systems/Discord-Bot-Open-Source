import type { DiscordAuditEntry, DiscordAuditRoleKind } from "@adobos/shared";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  buildChangeDiffRows,
  resolveSheetLayoutMode,
  type DiffRow,
  type SheetLayoutMode,
} from "@/features/moderation/auditChangeFormat";
import { cn } from "@/lib/utils";

function roleBadgeClass(
  kind: Extract<DiscordAuditRoleKind, "ROLE_ADD" | "ROLE_REMOVE">,
): string {
  return kind === "ROLE_ADD"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
}

function ValueCell({
  value,
  tone,
}: {
  value: string;
  tone?: "old" | "new" | "neutral";
}) {
  const isEmpty = !value || value === "—";
  const isBool = value === "Activado" || value === "Desactivado";

  if (isBool) {
    return (
      <Badge
        className={cn(
          "normal-case tracking-normal",
          value === "Activado"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        {value}
      </Badge>
    );
  }

  return (
    <span
      className={cn(
        "break-words text-sm",
        isEmpty && "text-muted-foreground",
        tone === "old" && !isEmpty && "text-rose-700 dark:text-rose-300",
        tone === "new" && !isEmpty && "text-emerald-700 dark:text-emerald-300",
      )}
    >
      {value}
    </span>
  );
}

function RoleChangesBlock({ entry }: { entry: DiscordAuditEntry }) {
  const added = entry.addedRoles ?? [];
  const removed = entry.removedRoles ?? [];
  const mode = entry.roleKind ?? "ROLE_UPDATE";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/15 p-3">
      {(mode === "ROLE_ADD" || mode === "ROLE_UPDATE") && added.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Roles añadidos
          </p>
          <div className="flex flex-wrap gap-2">
            {added.map((role) => (
              <Badge
                key={`add-${role}`}
                className={cn(
                  "gap-1 normal-case tracking-normal",
                  roleBadgeClass("ROLE_ADD"),
                )}
              >
                <span aria-hidden>+</span>
                {role}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {(mode === "ROLE_REMOVE" || mode === "ROLE_UPDATE") &&
      removed.length > 0 ? (
        <div className="space-y-2">
          {added.length > 0 ? <Separator className="my-1" /> : null}
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
            Roles eliminados
          </p>
          <div className="flex flex-wrap gap-2">
            {removed.map((role) => (
              <Badge
                key={`rem-${role}`}
                className={cn(
                  "gap-1 normal-case tracking-normal",
                  roleBadgeClass("ROLE_REMOVE"),
                )}
              >
                <span aria-hidden>−</span>
                {role}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {added.length === 0 && removed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin roles detallados en este evento.
        </p>
      ) : null}
    </div>
  );
}

function PropertyTable({
  rows,
  mode,
}: {
  rows: DiffRow[];
  mode: SheetLayoutMode;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Discord no reportó cambios detallados para este evento.
      </p>
    );
  }

  const valueHeader =
    mode === "create"
      ? "Valor asignado"
      : mode === "delete"
        ? "Último valor conocido"
        : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Propiedad</th>
            {mode === "update" ? (
              <>
                <th className="px-3 py-2">Antiguo</th>
                <th className="w-8 px-1 py-2 text-center" aria-hidden>
                  →
                </th>
                <th className="px-3 py-2">Nuevo</th>
              </>
            ) : (
              <th className="px-3 py-2">{valueHeader}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border/70 last:border-0"
            >
              <td className="px-3 py-2.5 align-top font-medium text-foreground/90">
                {row.label}
              </td>
              {mode === "update" ? (
                <>
                  <td className="bg-rose-500/5 px-3 py-2.5 align-top">
                    <ValueCell value={row.oldDisplay} tone="old" />
                  </td>
                  <td className="px-1 py-2.5 text-center text-muted-foreground">
                    →
                  </td>
                  <td className="bg-emerald-500/5 px-3 py-2.5 align-top">
                    <ValueCell value={row.newDisplay} tone="new" />
                  </td>
                </>
              ) : (
                <td
                  className={cn(
                    "px-3 py-2.5 align-top",
                    mode === "create" && "bg-emerald-500/5",
                    mode === "delete" && "bg-rose-500/5",
                  )}
                >
                  <ValueCell
                    value={
                      mode === "create" ? row.newDisplay : row.oldDisplay
                    }
                    tone={mode === "create" ? "new" : "old"}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Interior del Sheet: adapta layout a creación / actualización / eliminación. */
export function AuditEventDetails({ entry }: { entry: DiscordAuditEntry }) {
  if (entry.roleKind) {
    return <RoleChangesBlock entry={entry} />;
  }

  const mode = resolveSheetLayoutMode(entry.tone, entry.actionKey);
  const rows = buildChangeDiffRows(entry.changes);
  return <PropertyTable rows={rows} mode={mode} />;
}
