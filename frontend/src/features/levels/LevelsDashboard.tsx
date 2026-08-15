import type {
  GuildChannelAsset,
  GuildRoleAsset,
  LevelsConfig,
  LevelsLeaderboardEntry,
  LevelsReward,
  LevelsRoleMultiplier,
} from "@adobos/shared";
import { defaultLevelsConfig, xpForLevel } from "@adobos/shared";
import type { ColumnDef } from "@tanstack/react-table";
import {
  fetchGuildAssets,
  fetchLevelsConfig,
  fetchLevelsLeaderboard,
  saveLevelsConfig,
} from "@/lib/api";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { HeaderEnableSwitch } from "@/components/shared/HeaderEnableSwitch";
import { RoleColorDot } from "@/components/shared/RoleColorDot";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import {
  LeaderboardDiscordPreview,
  LevelUpDiscordPreview,
} from "@/features/levels/LevelsEmbedPreview";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TabId = "xp" | "rewards" | "leaderboard" | "discord";
type MonitorSideTab = "preview" | "datos";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const IGNORE_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15]);
const LEADERBOARD_LIMIT = 100;

function configFingerprint(config: LevelsConfig): string {
  return JSON.stringify({
    enabled: config.enabled,
    textXpMin: config.textXpMin,
    textXpMax: config.textXpMax,
    cooldownSeconds: config.cooldownSeconds,
    voiceEnabled: config.voiceEnabled,
    voiceXpPerMinute: config.voiceXpPerMinute,
    xpMultiplier: config.xpMultiplier,
    customMultipliers: config.customMultipliers.map((m) => ({
      roleId: m.roleId,
      multiplier: m.multiplier,
    })),
    ignoredChannels: [...config.ignoredChannels].sort(),
    ignoredRoles: [...config.ignoredRoles].sort(),
    levelUpChannelId: config.levelUpChannelId,
    levelUpFormat: config.levelUpFormat,
    levelUpMessage: config.levelUpMessage,
    levelUpEmbedTitle: config.levelUpEmbedTitle,
    levelUpEmbedColor: config.levelUpEmbedColor,
    levelUpShowThumbnail: config.levelUpShowThumbnail,
    levelUpImage: config.levelUpImage,
    liveLeaderboardChannelId: config.liveLeaderboardChannelId,
    leaderboardEmbedTitle: config.leaderboardEmbedTitle,
    leaderboardEmbedDescription: config.leaderboardEmbedDescription,
    leaderboardEmbedColor: config.leaderboardEmbedColor,
    leaderboardShowThumbnail: config.leaderboardShowThumbnail,
    rewards: config.rewards.map((r) => ({
      level: r.level,
      roleId: r.roleId,
    })),
  });
}

function newRewardRow(): LevelsReward {
  return { level: 5, roleId: "" };
}

function newMultiplierRow(): LevelsRoleMultiplier {
  return { roleId: "", multiplier: 1.5 };
}

function roleDotColor(role: GuildRoleAsset | undefined): string | number | null {
  if (!role) return null;
  return role.hexColor ?? role.color;
}

const leaderboardColumns: ColumnDef<LevelsLeaderboardEntry, unknown>[] = [
  {
    accessorKey: "rank",
    header: "#",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.rank}
      </span>
    ),
    meta: { className: "w-12" },
  },
  {
    id: "user",
    header: "Usuario",
    cell: ({ row }) => {
      const e = row.original;
      return (
        <div className="flex min-w-0 items-center gap-2">
          {e.avatarUrl ? (
            <img
              src={e.avatarUrl}
              alt=""
              className="size-7 shrink-0 rounded-full"
            />
          ) : (
            <div className="size-7 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{e.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              @{e.username}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "level",
    header: "Nivel",
    cell: ({ row }) => (
      <Badge className="normal-case tracking-normal font-mono text-xs">
        Nv. {row.original.level}
      </Badge>
    ),
    meta: { className: "w-24" },
  },
  {
    accessorKey: "xp",
    header: "XP total",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.xp.toLocaleString("es-MX")}
      </span>
    ),
    meta: { className: "w-28" },
  },
];

/** Dashboard Rangos y XP — ajustes, recompensas, clasificación y Discord. */
export function LevelsDashboard() {
  const [tab, setTab] = useState<TabId>("xp");
  const [monitorSideTab, setMonitorSideTab] =
    useState<MonitorSideTab>("preview");
  const [config, setConfig] = useState<LevelsConfig>(() =>
    defaultLevelsConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(defaultLevelsConfig()),
  );
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [guildIconUrl, setGuildIconUrl] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LevelsLeaderboardEntry[]>([]);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
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

  const liveChannelLabel = useMemo(() => {
    if (!config.liveLeaderboardChannelId) return "Sin configurar";
    const ch = textChannels.find(
      (c) => c.id === config.liveLeaderboardChannelId,
    );
    return ch ? `#${ch.name}` : "Canal configurado";
  }, [config.liveLeaderboardChannelId, textChannels]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetchLevelsLeaderboard(LEADERBOARD_LIMIT);
      setLeaderboard(res.entries);
      setLeaderboardTotal(res.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la clasificación.",
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, assets] = await Promise.all([
        fetchLevelsConfig(),
        fetchGuildAssets(),
      ]);
      setConfig(cfgRes.config);
      setSavedFingerprint(configFingerprint(cfgRes.config));
      setChannels(assets.channels);
      setRoles(assets.roles);
      setGuildIconUrl(assets.iconUrl ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar Rangos y XP.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "leaderboard") void loadLeaderboard();
  }, [tab, loadLeaderboard]);

  const patch = (partial: Partial<LevelsConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setSuccess(null);
  };

  const updateReward = (index: number, partial: Partial<LevelsReward>) => {
    setConfig((prev) => ({
      ...prev,
      rewards: prev.rewards.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    }));
    setSuccess(null);
  };

  const removeReward = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      rewards: prev.rewards.filter((_, i) => i !== index),
    }));
    setSuccess(null);
  };

  const addReward = () => {
    setConfig((prev) => ({
      ...prev,
      rewards: [...prev.rewards, newRewardRow()],
    }));
    setSuccess(null);
  };

  const updateMultiplier = (
    index: number,
    partial: Partial<LevelsRoleMultiplier>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      customMultipliers: prev.customMultipliers.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    }));
    setSuccess(null);
  };

  const removeMultiplier = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      customMultipliers: prev.customMultipliers.filter((_, i) => i !== index),
    }));
    setSuccess(null);
  };

  const addMultiplier = () => {
    setConfig((prev) => ({
      ...prev,
      customMultipliers: [...prev.customMultipliers, newMultiplierRow()],
    }));
    setSuccess(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveLevelsConfig({
        enabled: config.enabled,
        textXpMin: config.textXpMin,
        textXpMax: config.textXpMax,
        cooldownSeconds: config.cooldownSeconds,
        voiceEnabled: config.voiceEnabled,
        voiceXpPerMinute: config.voiceXpPerMinute,
        xpMultiplier: config.xpMultiplier,
        customMultipliers: config.customMultipliers,
        ignoredRoles: config.ignoredRoles,
        ignoredChannels: config.ignoredChannels,
        levelUpChannelId: config.levelUpChannelId,
        levelUpFormat: "EMBED",
        levelUpMessage: config.levelUpMessage,
        levelUpEmbedTitle: config.levelUpEmbedTitle,
        levelUpEmbedColor: config.levelUpEmbedColor,
        levelUpShowThumbnail: config.levelUpShowThumbnail,
        levelUpImage: config.levelUpImage,
        liveLeaderboardChannelId: config.liveLeaderboardChannelId,
        leaderboardEmbedTitle: config.leaderboardEmbedTitle,
        leaderboardEmbedDescription: config.leaderboardEmbedDescription,
        leaderboardEmbedColor: config.leaderboardEmbedColor,
        leaderboardShowThumbnail: config.leaderboardShowThumbnail,
        rewards: config.rewards,
      });
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      setSuccess("Configuración de Rangos y XP guardada.");
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando Rangos y XP…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderEnableSwitch
        idPrefix="levels"
        checked={config.enabled}
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
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
              <TabsTrigger
                className="w-full"
                active={tab === "xp"}
                onClick={() => setTab("xp")}
              >
                Ajustes de XP
              </TabsTrigger>
              <TabsTrigger
                className="w-full"
                active={tab === "rewards"}
                onClick={() => setTab("rewards")}
              >
                Recompensas
              </TabsTrigger>
              <TabsTrigger
                className="w-full"
                active={tab === "leaderboard"}
                onClick={() => setTab("leaderboard")}
              >
                Clasificación
              </TabsTrigger>
              <TabsTrigger
                className="w-full"
                active={tab === "discord"}
                onClick={() => setTab("discord")}
              >
                Discord y Exclusiones
              </TabsTrigger>
            </TabsList>

            {tab === "xp" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Texto</CardTitle>
                      <CardDescription>
                        XP aleatoria por mensaje con cooldown anti-spam.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="textXpMin">XP mínima</Label>
                        <Input
                          id="textXpMin"
                          type="number"
                          min={1}
                          max={10000}
                          className="h-9 w-24"
                          value={config.textXpMin}
                          onChange={(e) =>
                            patch({
                              textXpMin: Number(e.target.value) || 15,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="textXpMax">XP máxima</Label>
                        <Input
                          id="textXpMax"
                          type="number"
                          min={1}
                          max={10000}
                          className="h-9 w-24"
                          value={config.textXpMax}
                          onChange={(e) =>
                            patch({
                              textXpMax: Number(e.target.value) || 25,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="cooldownSeconds">
                          Cooldown (segundos)
                        </Label>
                        <Input
                          id="cooldownSeconds"
                          type="number"
                          min={0}
                          max={86400}
                          className="h-9 w-24"
                          value={config.cooldownSeconds}
                          onChange={(e) =>
                            patch({
                              cooldownSeconds: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Voz</CardTitle>
                      <CardDescription>
                        XP por minuto en canales de voz (sin mute/deafen).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <Label htmlFor="voiceXpPerMinute">XP por minuto</Label>
                          <p className="text-xs text-muted-foreground">
                            Solo cuenta miembros activos en voz.
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {config.voiceEnabled ? (
                            <Input
                              id="voiceXpPerMinute"
                              type="number"
                              min={0}
                              max={10000}
                              className="h-9 w-24"
                              value={config.voiceXpPerMinute}
                              onChange={(e) =>
                                patch({
                                  voiceXpPerMinute:
                                    Number(e.target.value) || 0,
                                })
                              }
                            />
                          ) : null}
                          <Switch
                            id="voiceEnabled"
                            checked={config.voiceEnabled}
                            onCheckedChange={(voiceEnabled) =>
                              patch({ voiceEnabled })
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Multiplicador</CardTitle>
                      <CardDescription>
                        Escala global de XP (texto y voz).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="xpMultiplier">Multiplicador base</Label>
                        <Input
                          id="xpMultiplier"
                          type="number"
                          min={1}
                          max={10}
                          step={0.1}
                          className="h-9 w-24"
                          value={config.xpMultiplier}
                          onChange={(e) =>
                            patch({
                              xpMultiplier: Number(e.target.value) || 1,
                            })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Multiplicadores personalizados
                      </CardTitle>
                      <CardDescription>
                        Bonus por rol. Si un miembro tiene varios, se usa el
                        máximo.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {config.customMultipliers.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                          Aún no hay multiplicadores. Añade el primero debajo.
                        </p>
                      ) : (
                        config.customMultipliers.map((entry, index) => {
                          const selectedRole = assignableRoles.find(
                            (r) => r.id === entry.roleId,
                          );
                          return (
                            <div
                              key={`mult-${index}-${entry.roleId || "new"}`}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5"
                            >
                              <Select
                                value={entry.roleId || undefined}
                                onValueChange={(roleId) =>
                                  updateMultiplier(index, { roleId })
                                }
                              >
                                <SelectTrigger className="h-9 min-w-[160px] flex-1">
                                  {selectedRole ? (
                                    <span className="flex min-w-0 items-center gap-2">
                                      <RoleColorDot
                                        color={roleDotColor(selectedRole)}
                                      />
                                      <span className="truncate">
                                        @{selectedRole.name}
                                      </span>
                                    </span>
                                  ) : (
                                    <SelectValue placeholder="Seleccionar rol" />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  {assignableRoles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                      <span className="flex items-center gap-2">
                                        <RoleColorDot
                                          color={roleDotColor(role)}
                                        />
                                        @{role.name}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-sm text-muted-foreground">
                                gana
                              </span>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  x
                                </span>
                                <Input
                                  type="number"
                                  min={0.1}
                                  max={10}
                                  step={0.1}
                                  className="h-9 w-20 pl-6"
                                  value={entry.multiplier}
                                  onChange={(e) =>
                                    updateMultiplier(index, {
                                      multiplier:
                                        Number(e.target.value) || 1,
                                    })
                                  }
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                aria-label="Eliminar multiplicador"
                                onClick={() => removeMultiplier(index)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          );
                        })
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={addMultiplier}
                      >
                        <Plus className="size-4" />
                        Añadir multiplicador
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "rewards" ? (
              <TabsContent>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Recompensas de rol
                    </CardTitle>
                    <CardDescription>
                      Al alcanzar un nivel se otorga el rol (acumulativo si sube
                      varios niveles de golpe).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {config.rewards.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                        Aún no hay recompensas. Añade la primera debajo.
                      </p>
                    ) : (
                      config.rewards.map((reward, index) => {
                        const selectedRole = assignableRoles.find(
                          (r) => r.id === reward.roleId,
                        );
                        return (
                          <div
                            key={`reward-${index}-${reward.id ?? "new"}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5"
                          >
                            <span className="text-sm text-muted-foreground">
                              Al alcanzar el nivel
                            </span>
                            <Input
                              type="number"
                              min={1}
                              max={500}
                              value={reward.level}
                              onChange={(e) =>
                                updateReward(index, {
                                  level: Number(e.target.value) || 1,
                                })
                              }
                              className="h-9 w-20"
                            />
                            <span className="text-sm text-muted-foreground">
                              otorgar rol
                            </span>
                            <Select
                              value={reward.roleId || undefined}
                              onValueChange={(roleId) =>
                                updateReward(index, { roleId })
                              }
                            >
                              <SelectTrigger className="h-9 min-w-[160px] flex-1">
                                {selectedRole ? (
                                  <span className="flex min-w-0 items-center gap-2">
                                    <RoleColorDot
                                      color={roleDotColor(selectedRole)}
                                    />
                                    <span className="truncate">
                                      @{selectedRole.name}
                                    </span>
                                  </span>
                                ) : (
                                  <SelectValue placeholder="Seleccionar rol" />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                {assignableRoles.map((role) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    <span className="flex items-center gap-2">
                                      <RoleColorDot
                                        color={roleDotColor(role)}
                                      />
                                      @{role.name}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label="Eliminar recompensa"
                              onClick={() => removeReward(index)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={addReward}
                    >
                      <Plus className="size-4" />
                      Añadir recompensa
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            {tab === "leaderboard" ? (
              <TabsContent>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">
                          Clasificación (Top {LEADERBOARD_LIMIT})
                        </CardTitle>
                        <CardDescription>
                          {leaderboardTotal > 0
                            ? `${Math.min(leaderboard.length, LEADERBOARD_LIMIT)} de ${leaderboardTotal} usuarios con XP.`
                            : "Usuarios ordenados por XP total."}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={leaderboardLoading}
                        onClick={() => void loadLeaderboard()}
                      >
                        {leaderboardLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        Actualizar
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {leaderboardLoading && leaderboard.length === 0 ? (
                      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Cargando clasificación…
                      </div>
                    ) : (
                      <DataTable
                        columns={leaderboardColumns}
                        data={leaderboard}
                        emptyMessage="Nadie tiene XP todavía."
                        minWidthClassName="min-w-[520px]"
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            {tab === "discord" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Canales de Discord
                      </CardTitle>
                      <CardDescription>
                        Leaderboard en vivo (Top 10) y anuncios de subida de
                        nivel. El mensaje se actualiza con debounce anti
                        rate-limit.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="liveLbChannel">
                          Canal de Leaderboard en vivo
                        </Label>
                        <Select
                          value={config.liveLeaderboardChannelId ?? "__none__"}
                          onValueChange={(value) =>
                            patch({
                              liveLeaderboardChannelId:
                                value === "__none__" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger id="liveLbChannel">
                            <SelectValue placeholder="Sin canal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sin canal</SelectItem>
                            {textChannels.map((ch) => (
                              <SelectItem key={ch.id} value={ch.id}>
                                #{ch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="levelUpChannel">
                          Canal de Subida de Nivel
                        </Label>
                        <Select
                          value={config.levelUpChannelId ?? "__none__"}
                          onValueChange={(value) =>
                            patch({
                              levelUpChannelId:
                                value === "__none__" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger id="levelUpChannel">
                            <SelectValue placeholder="Sin canal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sin canal</SelectItem>
                            {textChannels.map((ch) => (
                              <SelectItem key={ch.id} value={ch.id}>
                                #{ch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Si no hay canal, no se envía el anuncio de subida de
                          nivel.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Anuncio de subida de nivel
                      </CardTitle>
                      <CardDescription>
                        Embed fijo del bot (verde claro). Incluye el rol
                        desbloqueado o la próxima recompensa.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LevelUpDiscordPreview config={config} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Leaderboard en vivo
                      </CardTitle>
                      <CardDescription>
                        Embed fijo Top 10 (morado lila). Se actualiza con
                        debounce para evitar rate limits.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LeaderboardDiscordPreview
                        config={config}
                        guildIconUrl={guildIconUrl}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Exclusiones</CardTitle>
                      <CardDescription>
                        Roles y canales donde no se gana XP.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RoleMultiSelect
                        label="Roles ignorados"
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
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <div className="sticky top-6 flex min-h-[28rem] flex-col gap-4 self-start">
          {tab === "discord" ? (
            <Card className="flex min-h-[28rem] flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" />
                  Monitor
                </CardTitle>
                <CardDescription>
                  Vista previa Discord o resumen de datos.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
                  <TabsTrigger
                    className="w-full"
                    active={monitorSideTab === "preview"}
                    onClick={() => setMonitorSideTab("preview")}
                  >
                    Vista Previa
                  </TabsTrigger>
                  <TabsTrigger
                    className="w-full"
                    active={monitorSideTab === "datos"}
                    onClick={() => setMonitorSideTab("datos")}
                  >
                    Datos
                  </TabsTrigger>
                </TabsList>

                {monitorSideTab === "preview" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Anuncio de nivel
                      </p>
                      <LevelUpDiscordPreview config={config} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Leaderboard
                      </p>
                      <LeaderboardDiscordPreview
                        config={config}
                        guildIconUrl={guildIconUrl}
                      />
                    </div>
                  </div>
                ) : (
                  <StatusMonitorBody
                    config={config}
                    liveChannelLabel={liveChannelLabel}
                    dirty={dirty}
                    saving={saving}
                    onSave={() => void save()}
                  />
                )}

                {monitorSideTab === "preview" ? (
                  <Button
                    type="button"
                    className="mt-auto w-full"
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Guardar configuración
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" />
                  Monitor de estado
                </CardTitle>
                <CardDescription>Resumen en vivo de la config.</CardDescription>
              </CardHeader>
              <CardContent>
                <StatusMonitorBody
                  config={config}
                  liveChannelLabel={liveChannelLabel}
                  dirty={dirty}
                  saving={saving}
                  onSave={() => void save()}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusMonitorBody({
  config,
  liveChannelLabel,
  dirty,
  saving,
  onSave,
}: {
  config: LevelsConfig;
  liveChannelLabel: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Estado general</span>
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
        <span className="text-muted-foreground">Multiplicador base</span>
        <span className="font-mono text-xs">
          {config.xpMultiplier.toFixed(1)}x
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Recompensas</span>
        <span className="font-mono text-xs">{config.rewards.length}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">XP texto</span>
        <span className="font-mono text-xs">
          {config.textXpMin}–{config.textXpMax}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Leaderboard vivo</span>
        <span className="max-w-[140px] truncate text-right text-xs">
          {liveChannelLabel}
        </span>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground/80">
          <Info className="size-3.5" />
          Fórmula de nivel
        </div>
        <code className="text-[10px]">floor(0.1 × √totalXp)</code>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <p className="mb-2 text-[11px] font-medium text-foreground/80">
          Curva de XP (Preview)
        </p>
        <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
          {[1, 2, 3, 4, 5].map((level) => (
            <li
              key={level}
              className="flex items-center justify-between gap-2"
            >
              <span>Nivel {level}</span>
              <span>{xpForLevel(level).toLocaleString("es-MX")} XP</span>
            </li>
          ))}
        </ul>
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={!dirty || saving}
        onClick={onSave}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Guardar configuración
      </Button>
    </div>
  );
}
