import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  ActionLogCategory,
  ActionLogEntry,
} from "@adobos/shared";
import { fetchActionLogsHistory } from "@/lib/api";
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
import { ToastBanner } from "@/components/ui/toast";
import { ActionLogDetailsSheet } from "./ActionLogDetailsSheet";
import {
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  categoryBadgeClass,
} from "./labels";

const CATEGORY_FILTERS: Array<{ value: ActionLogCategory | "all"; label: string }> =
  [
    { value: "all", label: "Todas" },
    { value: "MESSAGES", label: "Mensajes" },
    { value: "MEMBERS", label: "Miembros" },
    { value: "ROLES", label: "Roles" },
    { value: "CHANNELS", label: "Canales" },
    { value: "ASSETS", label: "Recursos" },
  ];

export function ActionLogsHistoryTab() {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [category, setCategory] = useState<ActionLogCategory | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<ActionLogEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchActionLogsHistory({
        q: qDebounced || undefined,
        category,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: 50,
      });
      setEntries(result.entries);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar historial");
    } finally {
      setLoading(false);
    }
  }, [qDebounced, category, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, category, from, to]);

  const columns = useMemo<ColumnDef<ActionLogEntry>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Fecha / Hora",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString("es-MX")}
          </span>
        ),
      },
      {
        accessorKey: "category",
        header: "Categoría",
        cell: ({ row }) => (
          <Badge className={categoryBadgeClass(row.original.category)}>
            {CATEGORY_LABELS[row.original.category]}
          </Badge>
        ),
      },
      {
        accessorKey: "eventType",
        header: "Evento",
        cell: ({ row }) => (
          <Badge>
            {EVENT_TYPE_LABELS[row.original.eventType] ??
              row.original.eventType}
          </Badge>
        ),
      },
      {
        id: "actor",
        header: "Usuario / Ejecutor",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {row.original.executorTag ??
                row.original.targetTag ??
                "—"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.original.summary}
            </p>
          </div>
        ),
      },
      {
        id: "details",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setSelected(row.original);
              setSheetOpen(true);
            }}
          >
            <Eye className="size-3.5" aria-hidden />
            Detalles
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {error ? (
        <ToastBanner
          variant="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de registros</CardTitle>
          <CardDescription>
            Eventos capturados en SQLite (máx. 50 por página). Los mensajes muy
            antiguos pueden no incluir el texto previo si no estaban en caché de
            discord.js.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="logs-q">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="logs-q"
                  className="pl-9"
                  placeholder="Usuario, texto o tipo de evento…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={category}
                onValueChange={(v) =>
                  setCategory((v as ActionLogCategory | "all") || "all")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_FILTERS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Actualizar
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logs-from">Desde</Label>
              <Input
                id="logs-from"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logs-to">Hasta</Label>
              <Input
                id="logs-to"
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando registros…
            </div>
          ) : (
            <DataTable columns={columns} data={entries} />
          )}

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {total} registro{total === 1 ? "" : "s"} · página {page} de{" "}
              {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ActionLogDetailsSheet
        entry={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
