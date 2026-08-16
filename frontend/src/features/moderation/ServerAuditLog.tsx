import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  CalendarRange,
  Eye,
  FilterX,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type {
  DiscordAuditEntityFilter,
  DiscordAuditEntry,
  DiscordAuditRoleKind,
  DiscordAuditTargetKind,
  DiscordAuditTone,
  DiscordAuditToneFilter,
} from "@adobos/shared";
import {
  fetchDiscordAuditLog,
  searchModMembers,
} from "@/lib/api";
import {
  AsyncSearchSelect,
  type AsyncSelectOption,
} from "@/components/shared/AsyncSearchSelect";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { ToastBanner } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { AuditEventDetails } from "@/features/moderation/AuditEventDetails";
import { cn } from "@/lib/utils";

const TONE_OPTIONS: Array<{ value: DiscordAuditToneFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "create", label: "Creación" },
  { value: "update", label: "Actualización" },
  { value: "delete", label: "Eliminación" },
];

const ENTITY_OPTIONS: Array<{
  value: DiscordAuditEntityFilter;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  { value: "users", label: "Usuarios" },
  { value: "channels", label: "Canales" },
  { value: "roles", label: "Roles" },
  { value: "server", label: "Servidor" },
  { value: "emojis", label: "Emojis / Stickers" },
  { value: "webhooks", label: "Webhooks" },
];

const ENTITY_KIND_MAP: Record<
  Exclude<DiscordAuditEntityFilter, "all">,
  DiscordAuditTargetKind[]
> = {
  users: ["user"],
  channels: ["channel", "message"],
  roles: ["role"],
  server: ["guild", "invite", "integration", "unknown"],
  emojis: ["emoji", "sticker"],
  webhooks: ["webhook"],
};

function toneBadgeClass(tone: DiscordAuditTone): string {
  switch (tone) {
    case "create":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "delete":
      return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400";
    case "update":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    default:
      return "border-border bg-secondary text-secondary-foreground";
  }
}

function roleBadgeClass(kind: DiscordAuditRoleKind): string {
  switch (kind) {
    case "ROLE_ADD":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "ROLE_REMOVE":
      return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    case "ROLE_UPDATE":
      return "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  }
}

function actionBadgeClass(entry: DiscordAuditEntry): string {
  if (entry.roleKind) return roleBadgeClass(entry.roleKind);
  return toneBadgeClass(entry.tone);
}

function TruncateWithTooltip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <Tooltip content={text}>
      <span className={cn("block truncate", className)} tabIndex={0}>
        {text}
      </span>
    </Tooltip>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

function startOfDay(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00`).getTime();
}

function endOfDay(isoDate: string): number {
  return new Date(`${isoDate}T23:59:59.999`).getTime();
}

export function ServerAuditLog() {
  const [entries, setEntries] = useState<DiscordAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [executor, setExecutor] = useState<AsyncSelectOption | null>(null);
  const [toneFilter, setToneFilter] = useState<DiscordAuditToneFilter>("all");
  const [entityFilter, setEntityFilter] =
    useState<DiscordAuditEntityFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selected, setSelected] = useState<DiscordAuditEntry | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const searchExecutors = useCallback(async (q: string) => {
    const result = await searchModMembers(q);
    return result.members.map((member) => ({
      id: member.id,
      label: member.displayName || member.globalName || member.username,
      description: `@${member.username}`,
      meta: member.id,
      avatarUrl: member.avatarUrl,
    }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDiscordAuditLog({
        limit: 100,
        userId: executor?.id,
      });
      setEntries(data.entries);
      setFetchedAt(data.fetchedAt);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cargar la auditoría.";
      setToast(message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [executor?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (toneFilter !== "all" && entry.tone !== toneFilter) return false;

      if (entityFilter !== "all") {
        const kinds = ENTITY_KIND_MAP[entityFilter];
        if (!kinds.includes(entry.target.kind)) return false;
      }

      const created = new Date(entry.createdAt).getTime();
      if (dateFrom && created < startOfDay(dateFrom)) return false;
      if (dateTo && created > endOfDay(dateTo)) return false;

      return true;
    });
  }, [entries, toneFilter, entityFilter, dateFrom, dateTo]);

  function clearFilters(): void {
    setExecutor(null);
    setToneFilter("all");
    setEntityFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  const columns = useMemo<ColumnDef<DiscordAuditEntry, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Fecha",
        meta: { className: "w-[160px]" },
        cell: ({ row }) => (
          <TruncateWithTooltip
            text={formatWhen(row.original.createdAt)}
            className="text-xs text-muted-foreground"
          />
        ),
      },
      {
        id: "executor",
        header: "Ejecutor",
        meta: { className: "w-[200px]" },
        cell: ({ row }) => {
          const user = row.original.executor;
          if (!user) {
            return (
              <span className="text-sm text-muted-foreground">Desconocido</span>
            );
          }
          const full = `${user.displayName} (@${user.username})`;
          return (
            <Tooltip content={full}>
              <div className="flex min-w-0 items-center gap-2">
                <UserAvatar
                  src={user.avatarUrl}
                  name={user.displayName}
                  className="size-7"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {user.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{user.username}
                  </p>
                </div>
              </div>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "actionLabel",
        header: "Acción",
        meta: { className: "w-[180px]" },
        cell: ({ row }) => (
          <Tooltip content={row.original.actionLabel}>
            <Badge
              className={cn(
                "max-w-full truncate normal-case tracking-normal",
                actionBadgeClass(row.original),
              )}
            >
              {row.original.actionLabel}
            </Badge>
          </Tooltip>
        ),
      },
      {
        id: "target",
        header: "Objetivo",
        meta: { className: "w-[200px]" },
        cell: ({ row }) => (
          <Tooltip
            content={`${row.original.target.label} (${row.original.target.kind})`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{row.original.target.label}</p>
              <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                {row.original.target.kind}
              </p>
            </div>
          </Tooltip>
        ),
      },
      {
        id: "actions",
        header: "Detalles",
        meta: { className: "w-[100px]" },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setSelected(row.original)}
          >
            <Eye className="size-3.5" aria-hidden />
            Ver
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Auditoría General</CardTitle>
            <CardDescription>
              Espejo de solo lectura del Audit Log nativo (
              {filtered.length}/{entries.length || 0} visibles).
              {fetchedAt ? ` Actualizado ${formatWhen(fetchedAt)}.` : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={clearFilters}
            >
              <FilterX className="size-4" aria-hidden />
              Limpiar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                void load();
              }}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/80 bg-muted/10 p-3 md:grid-cols-2 xl:grid-cols-4">
            <AsyncSearchSelect
              label="Ejecutor"
              placeholder="Nombre o ID…"
              value={executor}
              onChange={setExecutor}
              onSearch={searchExecutors}
              disabled={loading}
            />

            <div className="space-y-2">
              <Label>Categoría de acción</Label>
              <Select
                value={toneFilter}
                disabled={loading}
                onValueChange={(value) =>
                  setToneFilter(value as DiscordAuditToneFilter)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Categoría…" />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Entidad afectada</Label>
              <Select
                value={entityFilter}
                disabled={loading}
                onValueChange={(value) =>
                  setEntityFilter(value as DiscordAuditEntityFilter)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Entidad…" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarRange className="size-3.5" aria-hidden />
                Rango de fechas
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  disabled={loading}
                  aria-label="Desde"
                  onChange={(event) => setDateFrom(event.target.value)}
                />
                <Input
                  type="date"
                  value={dateTo}
                  disabled={loading}
                  aria-label="Hasta"
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
            </div>
          </div>

          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando registro de auditoría…
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              tableFixed
              minWidthClassName="min-w-[840px]"
              emptyMessage="No hay entradas con esos filtros."
            />
          )}
        </CardContent>
      </Card>

      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.actionLabel ?? "Detalle del evento"}
        description={
          selected
            ? formatWhen(selected.createdAt)
            : undefined
        }
      >
        {selected ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Resumen
              </h3>
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={selected.executor?.avatarUrl}
                    name={selected.executor?.displayName ?? "Desconocido"}
                    className="size-10"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {selected.executor?.displayName ?? "Desconocido"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selected.executor
                        ? `@${selected.executor.username}`
                        : "Ejecutor no disponible"}
                    </p>
                  </div>
                </div>
                <p>
                  <span className="text-muted-foreground">Acción: </span>
                  <Badge
                    className={cn(
                      "align-middle normal-case tracking-normal",
                      actionBadgeClass(selected),
                    )}
                  >
                    {selected.actionLabel}
                  </Badge>
                  {selected.consolidatedCount && selected.consolidatedCount > 1 ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({selected.consolidatedCount} eventos agrupados)
                    </span>
                  ) : null}
                </p>
                <p>
                  <span className="text-muted-foreground">Objetivo: </span>
                  <span className="font-medium">{selected.target.label}</span>
                  <span className="ml-1 text-xs uppercase text-muted-foreground">
                    ({selected.target.kind})
                  </span>
                </p>
                {selected.target.id ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    ID {selected.target.id}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Razón
              </h3>
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                {selected.reason?.trim() || "Sin razón registrada."}
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selected.roleKind ? "Cambios de roles" : "Cambios"}
              </h3>
              <AuditEventDetails entry={selected} />
            </section>
          </div>
        ) : null}
      </Sheet>

      <ToastBanner message={toast} onDismiss={dismissToast} />
    </>
  );
}
