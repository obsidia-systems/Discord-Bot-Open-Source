import type {
  AutoDeleteConfig,
  AutoDeleteDelayUnit,
  AutoDeleteFilterType,
  AutoDeleteMode,
  AutoDeleteRule,
  AutoDeleteWeekday,
  GuildChannelAsset,
} from "@adobos/shared";
import {
  clampCountdownDelay,
  defaultAutoDeleteConfig,
  maxCountdownValue,
} from "@adobos/shared";
import {
  fetchAutoDeleteConfig,
  fetchGuildAssets,
  saveAutoDeleteConfig,
} from "@/lib/api";
import { HeaderEnableSwitch } from "@/components/shared/HeaderEnableSwitch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);

const MODE_LABELS: Record<AutoDeleteMode, string> = {
  COUNTDOWN: "Cuenta Regresiva",
  SCHEDULED: "Limpieza a Hora Fija",
};

const UNIT_LABELS: Record<AutoDeleteDelayUnit, string> = {
  seconds: "Segundos",
  minutes: "Minutos",
  hours: "Horas",
};

const FILTER_LABELS: Record<AutoDeleteFilterType, string> = {
  all: "Todos los mensajes",
  bots_only: "Solo de Bots",
  no_attachments: "Solo sin adjuntos (texto puro)",
};

/** Orden UI Lun→Dom; valor cron 0=Dom … 6=Sáb. */
const WEEKDAY_OPTIONS: Array<{ value: AutoDeleteWeekday; label: string }> = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function configFingerprint(config: AutoDeleteConfig): string {
  return JSON.stringify({
    enabled: config.enabled,
    rules: config.rules.map((r) => ({
      channelId: r.channelId,
      mode: r.mode,
      delayValue: r.delayValue,
      delayUnit: r.delayUnit,
      scheduledTime: r.scheduledTime,
      scheduledDays: [...(r.scheduledDays ?? [])].sort((a, b) => a - b),
      filterType: r.filterType,
    })),
  });
}

function newRule(): AutoDeleteRule {
  return {
    channelId: "",
    mode: "COUNTDOWN",
    delayValue: 60,
    delayUnit: "seconds",
    scheduledTime: "18:00",
    scheduledDays: [],
    filterType: "all",
  };
}

function toggleScheduledDay(
  days: AutoDeleteWeekday[],
  day: AutoDeleteWeekday,
): AutoDeleteWeekday[] {
  const set = new Set(days);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort((a, b) => a - b);
}

export function AutoDeleteDashboard() {
  const [config, setConfig] = useState<AutoDeleteConfig>(() =>
    defaultAutoDeleteConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(defaultAutoDeleteConfig()),
  );
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");

  const dirty = useMemo(
    () => configFingerprint(config) !== savedFingerprint,
    [config, savedFingerprint],
  );

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const duplicateChannelIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of config.rules) {
      if (!rule.channelId) continue;
      counts.set(rule.channelId, (counts.get(rule.channelId) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()]
        .filter(([, n]) => n > 1)
        .map(([id]) => id),
    );
  }, [config.rules]);

  const hasDuplicateChannels = duplicateChannelIds.size > 0;

  const scheduledCount = useMemo(
    () => config.rules.filter((r) => r.mode === "SCHEDULED").length,
    [config.rules],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, assets] = await Promise.all([
        fetchAutoDeleteConfig(),
        fetchGuildAssets(),
      ]);
      setConfig(cfgRes.config);
      setSavedFingerprint(configFingerprint(cfgRes.config));
      setTimezone(cfgRes.timezone || "UTC");
      setChannels(assets.channels);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar Auto-delete.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (partial: Partial<AutoDeleteConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setSuccess(null);
  };

  const updateRule = (index: number, partial: Partial<AutoDeleteRule>) => {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    }));
    setSuccess(null);
  };

  const removeRule = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
    setSuccess(null);
  };

  const addRule = () => {
    setConfig((prev) => ({
      ...prev,
      rules: [...prev.rules, newRule()],
    }));
    setSuccess(null);
  };

  const save = async () => {
    if (hasDuplicateChannels) {
      setError("No puedes configurar el mismo canal en más de una regla.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveAutoDeleteConfig({
        enabled: config.enabled,
        rules: config.rules,
      });
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      setTimezone(res.timezone || timezone);
      setSuccess("Configuración de Auto-delete guardada.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar la config.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Cargando Auto-delete…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderEnableSwitch
        idPrefix="auto-delete"
        checked={config.enabled}
        disabled={saving}
        onCheckedChange={(enabled) => patch({ enabled })}
      />

      <ToastBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />
      <ToastBanner
        variant="success"
        message={success}
        onDismiss={() => setSuccess(null)}
      />

      {!config.enabled ? (
        <div
          role="status"
          className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p>
            El módulo está inactivo. Las reglas se guardarán pero no se
            ejecutarán.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reglas de Canales</CardTitle>
              <CardDescription>
                Cuenta regresiva por mensaje o limpieza diaria a hora fija. Los
                anclados nunca se eliminan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border px-4 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No hay reglas de borrado configuradas
                  </p>
                  <Button type="button" variant="outline" onClick={addRule}>
                    <Plus className="size-4" />
                    Añadir regla
                  </Button>
                </div>
              ) : (
                <>
                  {config.rules.map((rule, index) => {
                    const isDuplicate =
                      Boolean(rule.channelId) &&
                      duplicateChannelIds.has(rule.channelId);
                    const usedElsewhere = new Set(
                      config.rules
                        .map((r, i) => (i === index ? "" : r.channelId))
                        .filter(Boolean),
                    );
                    const isCountdown = rule.mode !== "SCHEDULED";
                    return (
                      <div
                        key={`rule-${index}-${rule.channelId || "new"}`}
                        className={cn(
                          "relative mb-0 rounded-lg border border-border bg-muted/20 p-4 pr-12",
                          isDuplicate && "border-destructive/50",
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar regla"
                          onClick={() => removeRule(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>

                        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                Canal
                              </Label>
                              <Select
                                value={rule.channelId || undefined}
                                onValueChange={(channelId) =>
                                  updateRule(index, { channelId })
                                }
                              >
                                <SelectTrigger
                                  className={cn(
                                    "h-9",
                                    isDuplicate && "border-destructive",
                                  )}
                                >
                                  <SelectValue placeholder="Seleccionar canal" />
                                </SelectTrigger>
                                <SelectContent>
                                  {textChannels.map((ch) => (
                                    <SelectItem
                                      key={ch.id}
                                      value={ch.id}
                                      disabled={usedElsewhere.has(ch.id)}
                                    >
                                      #{ch.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                Modo
                              </Label>
                              <Select
                                value={rule.mode}
                                onValueChange={(value) =>
                                  updateRule(index, {
                                    mode: value as AutoDeleteMode,
                                  })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(
                                    Object.keys(MODE_LABELS) as AutoDeleteMode[]
                                  ).map((mode) => (
                                    <SelectItem key={mode} value={mode}>
                                      {MODE_LABELS[mode]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {isCountdown ? (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">
                                    Tiempo
                                  </Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={maxCountdownValue(rule.delayUnit)}
                                    className="h-9"
                                    value={rule.delayValue}
                                    onChange={(e) =>
                                      updateRule(index, {
                                        delayValue: clampCountdownDelay(
                                          Number(e.target.value) || 1,
                                          rule.delayUnit,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">
                                    Unidad
                                  </Label>
                                  <Select
                                    value={rule.delayUnit}
                                    onValueChange={(value) => {
                                      const delayUnit =
                                        value as AutoDeleteDelayUnit;
                                      updateRule(index, {
                                        delayUnit,
                                        delayValue: clampCountdownDelay(
                                          rule.delayValue,
                                          delayUnit,
                                        ),
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(
                                        Object.keys(
                                          UNIT_LABELS,
                                        ) as AutoDeleteDelayUnit[]
                                      ).map((unit) => (
                                        <SelectItem key={unit} value={unit}>
                                          {UNIT_LABELS[unit]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">
                                    Hora (24h)
                                  </Label>
                                  <Input
                                    type="time"
                                    step={60}
                                    className="h-9"
                                    value={rule.scheduledTime || "18:00"}
                                    onChange={(e) =>
                                      updateRule(index, {
                                        scheduledTime:
                                          e.target.value || "18:00",
                                      })
                                    }
                                  />
                                  <p className="text-[11px] text-muted-foreground">
                                    Zona horaria del servidor:{" "}
                                    <span className="font-mono text-foreground/80">
                                      {timezone}
                                    </span>
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">
                                    Días de la semana
                                  </Label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {WEEKDAY_OPTIONS.map((day) => {
                                      const active = (
                                        rule.scheduledDays ?? []
                                      ).includes(day.value);
                                      return (
                                        <button
                                          key={day.value}
                                          type="button"
                                          aria-pressed={active}
                                          className={cn(
                                            "h-8 min-w-10 rounded-md border px-2 text-xs font-medium transition-colors",
                                            active
                                              ? "border-primary bg-primary/15 text-primary"
                                              : "border-border bg-background text-muted-foreground hover:text-foreground",
                                          )}
                                          onClick={() =>
                                            updateRule(index, {
                                              scheduledDays:
                                                toggleScheduledDay(
                                                  rule.scheduledDays ?? [],
                                                  day.value,
                                                ),
                                            })
                                          }
                                        >
                                          {day.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                    {(rule.scheduledDays ?? []).length === 0
                                      ? "Sin selección = todos los días."
                                      : "Solo se ejecutará en los días marcados."}
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                Filtro
                              </Label>
                              <Select
                                value={rule.filterType}
                                onValueChange={(value) =>
                                  updateRule(index, {
                                    filterType: value as AutoDeleteFilterType,
                                  })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(
                                    Object.keys(
                                      FILTER_LABELS,
                                    ) as AutoDeleteFilterType[]
                                  ).map((filter) => (
                                    <SelectItem key={filter} value={filter}>
                                      {FILTER_LABELS[filter]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        {isDuplicate ? (
                          <p className="mt-3 text-xs text-destructive">
                            Este canal ya está en otra regla.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={addRule}
                  >
                    <Plus className="size-4" />
                    Añadir regla de borrado
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-4 self-start">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monitor de Estado</CardTitle>
              <CardDescription>
                Resumen de la configuración actual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Estado global</span>
                <Badge
                  className={cn(
                    "normal-case tracking-normal",
                    config.enabled
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {config.enabled ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Canales configurados
                </span>
                <span className="font-mono text-xs">
                  {
                    config.rules.filter((r) => /^\d{17,20}$/.test(r.channelId))
                      .length
                  }
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Limpiezas diarias</span>
                <span className="font-mono text-xs">{scheduledCount}</span>
              </div>
              {hasDuplicateChannels ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                  Hay canales duplicados. Corrige las reglas antes de guardar.
                </p>
              ) : null}
              <Button
                type="button"
                className="w-full"
                disabled={saving || !dirty || hasDuplicateChannels}
                onClick={() => void save()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Guardar configuración
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
