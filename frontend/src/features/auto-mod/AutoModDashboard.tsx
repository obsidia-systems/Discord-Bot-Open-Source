import { useCallback, useEffect, useMemo, useState } from "react";
import { Construction, Info, Loader2, Save, ShieldAlert } from "lucide-react";
import type {
  AutoModConfig,
  AutoModFilters,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import { defaultAutoModConfig } from "@adobos/shared";
import {
  fetchAutoModConfig,
  fetchGuildAssets,
  saveAutoModConfig,
} from "@/lib/api";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
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
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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
  });
}

function FilterToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
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

  const activeFilterCount = useMemo(() => {
    const f = config.filters;
    let n = 0;
    if (f.zalgo) n += 1;
    if (f.excessCaps) n += 1;
    if (f.bannedWords.trim()) n += 1;
    if (f.antiLinks) n += 1;
    if (f.messageSpam) n += 1;
    if (f.repeatedText) n += 1;
    if (f.mentionSpam) n += 1;
    return n;
  }, [config.filters]);

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
                        description="Activa si ≥70% del texto es mayúsculas (mín. 8 letras)."
                        checked={config.filters.excessCaps}
                        onCheckedChange={(excessCaps) =>
                          patchFilters({ excessCaps })
                        }
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor="bannedWords">Palabras prohibidas</Label>
                        <Textarea
                          id="bannedWords"
                          rows={4}
                          placeholder={"una palabra por línea\nejemplo\nspam"}
                          value={config.filters.bannedWords}
                          onChange={(e) =>
                            patchFilters({ bannedWords: e.target.value })
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Una entrada por línea. Vacío = filtro inactivo.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Filtros de enlaces</CardTitle>
                      <CardDescription>
                        Bloquea URLs fuera de la lista blanca.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FilterToggle
                        id="antiLinks"
                        label="Anti-Links (lista blanca)"
                        description="Solo se permiten dominios listados abajo."
                        checked={config.filters.antiLinks}
                        onCheckedChange={(antiLinks) =>
                          patchFilters({ antiLinks })
                        }
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor="allowedLinks">Enlaces permitidos</Label>
                        <Textarea
                          id="allowedLinks"
                          rows={3}
                          placeholder={"discord.com\nyoutube.com\ngithub.com"}
                          value={config.filters.allowedLinks}
                          onChange={(e) =>
                            patchFilters({ allowedLinks: e.target.value })
                          }
                          disabled={!config.filters.antiLinks}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Filtros de spam</CardTitle>
                      <CardDescription>
                        Ráfagas, repetición y menciones excesivas.
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
                        description="Supera el umbral de menciones por mensaje."
                        checked={config.filters.mentionSpam}
                        onCheckedChange={(mentionSpam) =>
                          patchFilters({ mentionSpam })
                        }
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor="mentionLimit">
                          Umbral de menciones
                        </Label>
                        <Input
                          id="mentionLimit"
                          type="number"
                          min={1}
                          max={50}
                          value={config.filters.mentionSpamLimit}
                          disabled={!config.filters.mentionSpam}
                          onChange={(e) =>
                            patchFilters({
                              mentionSpamLimit: Number(e.target.value) || 5,
                            })
                          }
                          className="max-w-[140px]"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "sanctions" ? (
              <TabsContent>
                <div className="space-y-4">
                  <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <Construction
                      className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                    <p>
                      <strong className="font-semibold">En desarrollo:</strong>{" "}
                      El Auto Mod actualmente inserta Warns en el expediente del
                      usuario. Los castigos automáticos basados en la
                      acumulación de Warns activos se habilitarán próximamente.
                    </p>
                  </div>

                  <Card className="opacity-90">
                    <CardHeader>
                      <CardTitle className="text-base">
                        Escalado de sanciones (vista previa)
                      </CardTitle>
                      <CardDescription>
                        Esqueleto visual. No se aplica todavía — el histórico de
                        Warns se conserva completo.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { warns: 3, action: "Timeout 10 minutos" },
                        { warns: 5, action: "Timeout 1 hora" },
                        { warns: 7, action: "Kick del servidor" },
                        { warns: 10, action: "Ban temporal / revisión staff" },
                      ].map((row) => (
                        <div
                          key={row.warns}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-sm"
                        >
                          <span className="text-muted-foreground">A los</span>
                          <Badge className="font-mono">{row.warns} Warns</Badge>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium">{row.action}</span>
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
                <span className="font-mono text-xs">{activeFilterCount} / 7</span>
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

              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <Label htmlFor="master-enabled" className="text-sm">
                  Habilitar Auto Mod
                </Label>
                <Switch
                  id="master-enabled"
                  checked={config.enabled}
                  onCheckedChange={(enabled) => patch({ enabled })}
                />
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
