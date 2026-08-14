import type {
  AutoModConfig,
  AutoModFilters,
  AutoModWarnDecayDays,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import {
  AUTO_MOD_TOGGLE_FILTER_COUNT,
  AUTO_MOD_WARN_DECAY_OPTIONS,
  countActiveAutoModFilters,
  defaultAutoModConfig,
} from "@adobos/shared";
import {
  fetchAutoModConfig,
  fetchGuildAssets,
  saveAutoModConfig,
} from "@/lib/api";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { HeaderEnableSwitch } from "@/components/shared/HeaderEnableSwitch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Construction, Info, Loader2, Save, ShieldAlert, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type TabId = "filters" | "sanctions" | "exclusions";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const IGNORE_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15]);

function configFingerprint(config: AutoModConfig): string {
  return JSON.stringify({
    enabled: config.enabled,
    filters: config.filters,
    ignoredChannels: [...config.ignoredChannels].sort(),
    ignoredRoles: [...config.ignoredRoles].sort(),
    logChannelId: config.logChannelId,
    warnDecayDays: config.warnDecayDays,
  });
}

function warnDecayLabel(days: AutoModWarnDecayDays): string {
  return (
    AUTO_MOD_WARN_DECAY_OPTIONS.find((o) => o.value === days)?.label ??
    `${days} días`
  );
}

/** Ajustes hijos del switch padre (divulgación progresiva). */
function NestedSettings({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 pt-1">{children}</div>;
}

function FilterToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  headerExtra,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Control compacto junto al switch (p. ej. umbral inline). */
  headerExtra?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {checked && headerExtra ? headerExtra : null}
          <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        </div>
      </div>
      {checked && children ? <NestedSettings>{children}</NestedSettings> : null}
    </div>
  );
}

function TagListInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  emptyHint,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyHint: string;
}) {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const next = draft.trim();
    if (!next) return;
    const exists = values.some((v) => v.toLowerCase() === next.toLowerCase());
    if (!exists) onChange([...values, next]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addValue();
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge
              key={value.toLowerCase()}
              className="gap-1 normal-case tracking-normal py-1 pl-2 pr-1 text-xs font-medium"
            >
              {value}
              <button
                type="button"
                aria-label={`Quitar ${value}`}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                onClick={() =>
                  onChange(
                    values.filter(
                      (v) => v.toLowerCase() !== value.toLowerCase(),
                    ),
                  )
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  );
}

/** Isla Auto Mod — Fase 1: filtros, esqueleto de sanciones, exclusiones. */
export function AutoModDashboard() {
  const [tab, setTab] = useState<TabId>("filters");
  const [config, setConfig] = useState<AutoModConfig>(() =>
    defaultAutoModConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(defaultAutoModConfig()),
  );
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const ignoreChannels = useMemo(
    () =>
      channels
        .filter((ch) => IGNORE_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => {
          const ac = a.type === 4 ? 0 : 1;
          const bc = b.type === 4 ? 0 : 1;
          if (ac !== bc) return ac - bc;
          return a.position - b.position || a.name.localeCompare(b.name);
        }),
    [channels],
  );

  const assignableRoles = useMemo(
    () =>
      roles
        .filter((r) => !r.managed && r.name !== "@everyone")
        .sort((a, b) => b.position - a.position),
    [roles],
  );

  const activeFilterCount = useMemo(
    () => countActiveAutoModFilters(config.filters),
    [config.filters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, assets] = await Promise.all([
        fetchAutoModConfig(),
        fetchGuildAssets(),
      ]);
      setConfig(cfgRes.config);
      setSavedFingerprint(configFingerprint(cfgRes.config));
      setChannels(assets.channels);
      setRoles(assets.roles);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar Auto Mod",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(partial: Partial<AutoModConfig>): void {
    setConfig((prev) => ({ ...prev, ...partial }));
  }

  function patchFilters(partial: Partial<AutoModFilters>): void {
    setConfig((prev) => ({
      ...prev,
      filters: { ...prev.filters, ...partial },
    }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveAutoModConfig({
        enabled: config.enabled,
        filters: config.filters,
        ignoredRoles: config.ignoredRoles,
        ignoredChannels: config.ignoredChannels,
        logChannelId: config.logChannelId,
        warnDecayDays: config.warnDecayDays,
      });
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      setSuccess("Configuración de Auto Mod guardada.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar Auto Mod",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Cargando Auto Mod…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderEnableSwitch
        idPrefix="auto-mod"
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Tabs>
            <TabsList>
              <TabsTrigger
                active={tab === "filters"}
                onClick={() => setTab("filters")}
              >
                Filtros y Reglas
              </TabsTrigger>
              <TabsTrigger
                active={tab === "sanctions"}
                onClick={() => setTab("sanctions")}
              >
                Sistema de Sanciones
              </TabsTrigger>
              <TabsTrigger
                active={tab === "exclusions"}
                onClick={() => setTab("exclusions")}
              >
                Exclusiones y Logs
              </TabsTrigger>
            </TabsList>

            {tab === "filters" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Filtros de texto</CardTitle>
                      <CardDescription>
                        Detección heurística sobre el contenido del mensaje.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FilterToggle
                        id="zalgo"
                        label="Zalgo"
                        description="Bloquea texto con demasiados combining marks."
                        checked={config.filters.zalgo}
                        onCheckedChange={(zalgo) => patchFilters({ zalgo })}
                      />
                      <FilterToggle
                        id="excessCaps"
                        label="Exceso de mayúsculas"
                        description="Umbral configurable de mayúsculas en el mensaje."
                        checked={config.filters.excessCaps}
                        onCheckedChange={(excessCaps) =>
                          patchFilters({ excessCaps })
                        }
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="capsPercentage">
                              Porcentaje máximo (%)
                            </Label>
                            <Input
                              id="capsPercentage"
                              type="number"
                              min={1}
                              max={100}
                              value={config.filters.capsPercentage}
                              onChange={(e) =>
                                patchFilters({
                                  capsPercentage:
                                    Number(e.target.value) || 70,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="capsMinLength">
                              Longitud mínima (caracteres)
                            </Label>
                            <Input
                              id="capsMinLength"
                              type="number"
                              min={1}
                              max={500}
                              value={config.filters.capsMinLength}
                              onChange={(e) =>
                                patchFilters({
                                  capsMinLength: Number(e.target.value) || 8,
                                })
                              }
                            />
                          </div>
                        </div>
                      </FilterToggle>
                      <FilterToggle
                        id="bannedWords"
                        label="Palabras prohibidas"
                        description="Bloquea mensajes que contengan palabras de la lista."
                        checked={config.filters.bannedWordsEnabled}
                        onCheckedChange={(bannedWordsEnabled) =>
                          patchFilters({ bannedWordsEnabled })
                        }
                      >
                        <TagListInput
                          id="bannedWordsInput"
                          label="Lista"
                          values={config.filters.bannedWords}
                          onChange={(bannedWords) =>
                            patchFilters({ bannedWords })
                          }
                          placeholder="Escribe una palabra y presiona Enter..."
                          emptyHint="Añade palabras con Enter. Se guardan como etiquetas."
                        />
                      </FilterToggle>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Filtros de enlaces</CardTitle>
                      <CardDescription>
                        Invitaciones de Discord y URLs fuera de lista blanca.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FilterToggle
                        id="antiInvites"
                        label="Anti-Invitaciones de Discord"
                        description="Bloquea discord.gg y discord.com/invite."
                        checked={config.filters.antiInvites}
                        onCheckedChange={(antiInvites) =>
                          patchFilters({ antiInvites })
                        }
                      />
                      <FilterToggle
                        id="antiLinks"
                        label="Anti-Links (lista blanca)"
                        description="Solo se permiten dominios listados abajo."
                        checked={config.filters.antiLinks}
                        onCheckedChange={(antiLinks) =>
                          patchFilters({ antiLinks })
                        }
                      >
                        <TagListInput
                          id="allowedLinksInput"
                          label="Enlaces permitidos"
                          values={config.filters.allowedLinks}
                          onChange={(allowedLinks) =>
                            patchFilters({ allowedLinks })
                          }
                          placeholder="dominio.com y Enter..."
                          emptyHint="Añade dominios con Enter (ej. youtube.com)."
                        />
                      </FilterToggle>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Filtros de spam</CardTitle>
                      <CardDescription>
                        Ráfagas, repetición, menciones y muros de texto.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FilterToggle
                        id="messageSpam"
                        label="Spam de mensajes"
                        description="≥5 mensajes del mismo usuario en 4 segundos."
                        checked={config.filters.messageSpam}
                        onCheckedChange={(messageSpam) =>
                          patchFilters({ messageSpam })
                        }
                      />
                      <FilterToggle
                        id="repeatedText"
                        label="Texto repetido"
                        description="Mismo contenido ≥3 veces en 12 segundos."
                        checked={config.filters.repeatedText}
                        onCheckedChange={(repeatedText) =>
                          patchFilters({ repeatedText })
                        }
                      />
                      <FilterToggle
                        id="mentionSpam"
                        label="Spam de menciones"
                        description="Bloquea si el mensaje supera el máximo de menciones."
                        checked={config.filters.mentionSpam}
                        onCheckedChange={(mentionSpam) =>
                          patchFilters({ mentionSpam })
                        }
                        headerExtra={
                          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1">
                            <Label
                              htmlFor="mentionLimit"
                              className="whitespace-nowrap text-[11px] font-normal text-muted-foreground"
                            >
                              Máx.
                            </Label>
                            <Input
                              id="mentionLimit"
                              type="number"
                              min={1}
                              max={50}
                              value={config.filters.mentionSpamLimit}
                              onChange={(e) =>
                                patchFilters({
                                  mentionSpamLimit:
                                    Number(e.target.value) || 5,
                                })
                              }
                              className="h-7 w-14 border-0 bg-transparent px-1 text-center shadow-none focus-visible:ring-0"
                            />
                          </div>
                        }
                      />
                      <FilterToggle
                        id="textFlood"
                        label="Muros de texto (Text Flood)"
                        description="Mensajes demasiado largos o con demasiados saltos de línea."
                        checked={config.filters.textFlood}
                        onCheckedChange={(textFlood) =>
                          patchFilters({ textFlood })
                        }
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="floodMaxChars">
                              Límite de caracteres
                            </Label>
                            <Input
                              id="floodMaxChars"
                              type="number"
                              min={50}
                              max={4000}
                              value={config.filters.floodMaxChars}
                              onChange={(e) =>
                                patchFilters({
                                  floodMaxChars:
                                    Number(e.target.value) || 800,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="floodMaxLines">
                              Límite de saltos de línea
                            </Label>
                            <Input
                              id="floodMaxLines"
                              type="number"
                              min={1}
                              max={100}
                              value={config.filters.floodMaxLines}
                              onChange={(e) =>
                                patchFilters({
                                  floodMaxLines: Number(e.target.value) || 6,
                                })
                              }
                            />
                          </div>
                        </div>
                      </FilterToggle>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "sanctions" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Caducidad de Warns
                      </CardTitle>
                      <CardDescription>
                        Define cuánto tiempo un Warn cuenta como activo para
                        futuros castigos automáticos.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="warn-decay">Periodo de caducidad</Label>
                        <Select
                          value={String(config.warnDecayDays)}
                          onValueChange={(value) =>
                            patch({
                              warnDecayDays: Number(
                                value,
                              ) as AutoModWarnDecayDays,
                            })
                          }
                        >
                          <SelectTrigger id="warn-decay" className="max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUTO_MOD_WARN_DECAY_OPTIONS.map((opt) => (
                              <SelectItem
                                key={opt.value}
                                value={String(opt.value)}
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Los Warns más antiguos a este periodo no sumarán para
                          castigos automáticos, pero seguirán en el expediente
                          histórico.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <Construction
                      className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                    <p>
                      Constructor Dinámico de Sanciones en desarrollo.
                      Próximamente podrás encadenar Warns con Timeouts, Kicks y
                      Bans directamente.
                    </p>
                  </div>

                  <Card className="opacity-80">
                    <CardHeader>
                      <CardTitle className="text-base">
                        Escalado de sanciones (vista previa)
                      </CardTitle>
                      <CardDescription>
                        Mockup estático — no se guarda ni se ejecuta en esta
                        fase.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pointer-events-none space-y-3 select-none">
                      {[
                        { warns: 3, action: "Timeout 10 mins" },
                        { warns: 5, action: "Timeout 1 hora" },
                        { warns: 7, action: "Kick del servidor" },
                      ].map((row) => (
                        <div
                          key={row.warns}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/15 px-3 py-2.5 text-sm text-muted-foreground"
                          aria-disabled
                        >
                          <Badge className="border-border bg-background font-mono text-muted-foreground">
                            A los {row.warns} Warns
                          </Badge>
                          <span aria-hidden>🡒</span>
                          <span className="font-medium text-muted-foreground/90">
                            {row.action}
                          </span>
                          <Badge className="ml-auto border-border bg-background text-muted-foreground">
                            Próximamente
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "exclusions" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Exclusiones</CardTitle>
                      <CardDescription>
                        Roles inmunes y canales donde Auto Mod no actúa.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RoleMultiSelect
                        label="Roles inmunes"
                        roles={assignableRoles}
                        value={config.ignoredRoles}
                        onChange={(ignoredRoles) => patch({ ignoredRoles })}
                      />
                      <ChannelMultiSelect
                        label="Canales / categorías ignorados"
                        channels={ignoreChannels}
                        value={config.ignoredChannels}
                        onChange={(ignoredChannels) =>
                          patch({ ignoredChannels })
                        }
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Canal de alertas de seguridad
                      </CardTitle>
                      <CardDescription>
                        Si está vacío, se usa el canal global de Action Logs.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        <Label htmlFor="logChannel">Canal de alertas</Label>
                        <Select
                          value={config.logChannelId ?? "__none__"}
                          onValueChange={(value) =>
                            patch({
                              logChannelId:
                                value === "__none__" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger id="logChannel">
                            <SelectValue placeholder="Usar fallback Action Logs" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              Usar fallback Action Logs
                            </SelectItem>
                            {textChannels.map((ch) => (
                              <SelectItem key={ch.id} value={ch.id}>
                                #{ch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <div className="sticky top-6 flex flex-col gap-4 self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-primary" aria-hidden />
                Monitor de estado
              </CardTitle>
              <CardDescription>
                Resumen en vivo antes de guardar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Estado general</span>
                <Badge
                  className={
                    config.enabled
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : undefined
                  }
                >
                  {config.enabled ? "Activo" : "Inactivo"}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Filtros activos</span>
                <span className="font-mono text-xs">
                  {activeFilterCount} / {AUTO_MOD_TOGGLE_FILTER_COUNT}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Exclusiones</span>
                <span className="text-xs">
                  {config.ignoredChannels.length} canales ·{" "}
                  {config.ignoredRoles.length} roles
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Alertas</span>
                <span className="truncate text-xs">
                  {config.logChannelId
                    ? `#${textChannels.find((c) => c.id === config.logChannelId)?.name ?? config.logChannelId}`
                    : "Fallback Action Logs"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Caducidad</span>
                <span className="text-xs">
                  {warnDecayLabel(config.warnDecayDays)}
                </span>
              </div>

              <Button
                className="w-full"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Guardando…
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden />
                    Guardar configuración
                  </>
                )}
              </Button>

              {!dirty ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  Sin cambios pendientes.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p className={cn("leading-relaxed")}>
                Cada infracción borra el mensaje, inserta un Warn con el bot
                como ejecutor y notifica por DM. El histórico completo queda en
                el expediente del usuario.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
