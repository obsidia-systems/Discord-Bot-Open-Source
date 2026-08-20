import type {
  GuildRoleAsset,
  SystemCommandCategory,
  SystemCommandConfig,
} from "@adobos/shared";
import { SYSTEM_COMMAND_CATEGORY_LABELS } from "@adobos/shared";
import {
  fetchGuildAssets,
  fetchSystemCommands,
  saveSystemCommands,
} from "@/lib/api";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Gavel,
  Loader2,
  Save,
  Search,
  Terminal,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type CategoryFilter = "all" | SystemCommandCategory;

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "moderation", label: SYSTEM_COMMAND_CATEGORY_LABELS.moderation },
  { id: "levels", label: SYSTEM_COMMAND_CATEGORY_LABELS.levels },
  { id: "forms", label: SYSTEM_COMMAND_CATEGORY_LABELS.forms },
  { id: "utilities", label: SYSTEM_COMMAND_CATEGORY_LABELS.utilities },
];

const CATEGORY_STYLES: Record<
  SystemCommandCategory,
  { badge: string; icon: typeof Gavel }
> = {
  moderation: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    icon: Gavel,
  },
  levels: {
    badge:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    icon: TrendingUp,
  },
  forms: {
    badge:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    icon: ClipboardList,
  },
  utilities: {
    badge:
      "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    icon: Wrench,
  },
};

function commandsFingerprint(commands: SystemCommandConfig[]): string {
  return JSON.stringify(
    commands.map((c) => ({
      commandName: c.name,
      enabled: c.enabled,
      allowedRoles: [...c.allowedRoles].sort(),
      ephemeral: c.ephemeral,
    })),
  );
}

export function SystemCommandsDashboard() {
  const [commands, setCommands] = useState<SystemCommandConfig[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const dirty = useMemo(
    () => commandsFingerprint(commands) !== savedFingerprint,
    [commands, savedFingerprint],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const [list, assets] = await Promise.all([
        fetchSystemCommands(),
        fetchGuildAssets(),
      ]);
      setCommands(list);
      setSavedFingerprint(commandsFingerprint(list));
      setRoles(assets.roles ?? []);
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error al cargar comandos del sistema.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((cmd) => {
      if (category !== "all" && cmd.category !== category) return false;
      if (!q) return true;
      return (
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
      );
    });
  }, [commands, category, query]);

  function patchCommand(
    name: string,
    patch: Partial<
      Pick<SystemCommandConfig, "enabled" | "allowedRoles" | "ephemeral">
    >,
  ): void {
    setCommands((prev) =>
      prev.map((c) => (c.name === name ? { ...c, ...patch } : c)),
    );
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setToast(null);
    try {
      const next = await saveSystemCommands(
        commands.map((c) => ({
          commandName: c.name,
          enabled: c.enabled,
          allowedRoles: c.allowedRoles,
          ephemeral: c.ephemeral,
        })),
      );
      setCommands(next);
      setSavedFingerprint(commandsFingerprint(next));
      setToast({ variant: "success", message: "Cambios guardados." });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Cargando comandos…
      </div>
    );
  }

  return (
    <div className="relative space-y-6 pb-24">
      {toast ? (
        <ToastBanner
          variant={toast.variant}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <header className="space-y-1 lg:hidden">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Comandos del Sistema
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Controla qué comandos fijos están activos y qué roles tienen permiso
          de usarlos.
        </p>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o descripción…"
            className="pl-9"
            aria-label="Buscar comandos"
          />
        </div>
        <Tabs>
          <TabsList className="h-auto flex-wrap justify-start">
            {CATEGORY_FILTERS.map((f) => (
              <TabsTrigger
                key={f.id}
                active={category === f.id}
                className="text-xs sm:text-sm"
                onClick={() => setCategory(f.id)}
              >
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay comandos que coincidan con el filtro.
            {category === "forms"
              ? " Los slash de formularios aún no están registrados."
              : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cmd) => {
            const style = CATEGORY_STYLES[cmd.category];
            const Icon = style.icon;
            return (
              <Card
                key={cmd.name}
                className={cn(
                  "flex flex-col",
                  !cmd.enabled && "opacity-70",
                )}
              >
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <Badge
                        className={cn(
                          "gap-1 font-normal normal-case tracking-normal",
                          style.badge,
                        )}
                      >
                        <Icon className="size-3" />
                        {SYSTEM_COMMAND_CATEGORY_LABELS[cmd.category]}
                      </Badge>
                      <CardTitle className="font-mono text-base">
                        /{cmd.name}
                      </CardTitle>
                    </div>
                    <Switch
                      checked={cmd.enabled}
                      onCheckedChange={(enabled) =>
                        patchCommand(cmd.name, { enabled })
                      }
                      aria-label={`Activar /${cmd.name}`}
                    />
                  </div>
                  <CardDescription className="text-sm leading-relaxed">
                    {cmd.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-4 border-t pt-4">
                  <RoleMultiSelect
                    label="Roles autorizados"
                    placeholder="Cualquier miembro (vacío)…"
                    roles={roles}
                    value={cmd.allowedRoles}
                    onChange={(allowedRoles) =>
                      patchCommand(cmd.name, { allowedRoles })
                    }
                    emptyHint={
                      cmd.requiresAdminByDefault
                        ? "Sin roles: se exige permiso de moderación de Discord."
                        : "Sin roles: cualquier miembro puede usarlo."
                    }
                  />
                  {cmd.supportsEphemeral ? (
                    <div className="flex items-center justify-between gap-3">
                      <Label
                        htmlFor={`ephemeral-${cmd.name}`}
                        className="text-xs leading-snug text-muted-foreground"
                      >
                        Respuesta efímera (solo visible para quien lo ejecuta)
                      </Label>
                      <Switch
                        id={`ephemeral-${cmd.name}`}
                        checked={cmd.ephemeral}
                        onCheckedChange={(ephemeral) =>
                          patchCommand(cmd.name, { ephemeral })
                        }
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
          !dirty && "pointer-events-none opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Tienes cambios sin guardar.
          </p>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar Cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
