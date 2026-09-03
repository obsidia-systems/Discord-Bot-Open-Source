import type {
  GuildChannelAsset,
  GuildRoleAsset,
  LevelsChannelMultiplier,
  LevelsConfig,
  LevelsLeaderboardEntry,
  LevelsReward,
  LevelsRoleMultiplier,
} from "@adobos/shared";
import { defaultLevelsConfig, calculateBaseXPForLevel } from "@adobos/shared";
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
import { UserAvatar } from "@/components/shared/UserAvatar";
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
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Hash,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingUp,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TabId = "xp" | "rewards" | "leaderboard" | "discord";
type MonitorSideTab = "preview" | "datos";
type MultipliersTab = "roles" | "channels";

const TEXT_CHANNEL_TYPES = new Set([0, 5]);
/** Texto + voz (+ stage/anuncio/foro) para hot zones. */
const MULTIPLIER_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15]);
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
    streamMultiplier: config.streamMultiplier,
    xpMultiplier: config.xpMultiplier,
    customMultipliers: config.customMultipliers.map((m) => ({
      roleId: m.roleId,
      multiplier: m.multiplier,
    })),
    customChannelMultipliers: config.customChannelMultipliers.map((m) => ({
      channelId: m.channelId,
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

function newChannelMultiplierRow(): LevelsChannelMultiplier {
  return { channelId: "", multiplier: 1.5 };
}

function isVoiceChannelType(type: number): boolean {
  return type === 2 || type === 13;
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
    header: "User",
    cell: ({ row }) => {
      const e = row.original;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar
            src={e.avatarUrl}
            name={e.displayName}
            className="size-7"
          />
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
    header: "Level",
    cell: ({ row }) => (
      <Badge className="normal-case tracking-normal font-mono text-xs">
        Lv. {row.original.level}
      </Badge>
    ),
    meta: { className: "w-24" },
  },
  {
    accessorKey: "xp",
    header: "Total XP",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.xp.toLocaleString("en-US")}
      </span>
    ),
    meta: { className: "w-28" },
  },
];

/** Dashboard Levels — ajustes, recompensas, clasificación y Discord. */
export function LevelsDashboard() {
  const [tab, setTab] = useState<TabId>("xp");
  const [multipliersTab, setMultipliersTab] =
    useState<MultipliersTab>("roles");
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

  const multiplierChannels = useMemo(
    () =>
      channels
        .filter((ch) => MULTIPLIER_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => {
          const av = isVoiceChannelType(a.type) ? 1 : 0;
          const bv = isVoiceChannelType(b.type) ? 1 : 0;
          if (av !== bv) return av - bv;
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

  /** Multiplicadores: roles normales + Server Booster (managed nativo). */
  const multiplierRoles = useMemo(
    () =>
      roles
        .filter(
          (r) =>
            r.name !== "@everyone" && (!r.managed || r.premiumSubscriber),
        )
        .sort((a, b) => b.position - a.position),
    [roles],
  );

  const liveChannelLabel = useMemo(() => {
    if (!config.liveLeaderboardChannelId) return "Not configured";
    const ch = textChannels.find(
      (c) => c.id === config.liveLeaderboardChannelId,
    );
    return ch ? `#${ch.name}` : "Configured channel";
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
          : "Couldn't load the leaderboard.",
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
        err instanceof Error ? err.message : "Couldn't load Levels.",
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

  const updateChannelMultiplier = (
    index: number,
    partial: Partial<LevelsChannelMultiplier>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      customChannelMultipliers: prev.customChannelMultipliers.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    }));
    setSuccess(null);
  };

  const removeChannelMultiplier = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      customChannelMultipliers: prev.customChannelMultipliers.filter(
        (_, i) => i !== index,
      ),
    }));
    setSuccess(null);
  };

  const addChannelMultiplier = () => {
    setConfig((prev) => ({
      ...prev,
      customChannelMultipliers: [
        ...prev.customChannelMultipliers,
        newChannelMultiplierRow(),
      ],
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
        streamMultiplier: config.streamMultiplier,
        xpMultiplier: config.xpMultiplier,
        customMultipliers: config.customMultipliers,
        customChannelMultipliers: config.customChannelMultipliers,
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
      setSuccess("Levels configuration saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save the config.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Levels…
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
                XP Settings
              </TabsTrigger>
              <TabsTrigger
                className="w-full"
                active={tab === "rewards"}
                onClick={() => setTab("rewards")}
              >
                Rewards
              </TabsTrigger>
              <TabsTrigger
                className="w-full"
                active={tab === "leaderboard"}
                onClick={() => setTab("leaderboard")}
              >
                Leaderboard
              </TabsTrigger>
              <TabsTrigger
                className="w-full"
                active={tab === "discord"}
                onClick={() => setTab("discord")}
              >
                Discord and Exclusions
              </TabsTrigger>
            </TabsList>

            {tab === "xp" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Text</CardTitle>
                      <CardDescription>
                        Random XP per message with an anti-spam cooldown.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="textXpMin">Minimum XP</Label>
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
                        <Label htmlFor="textXpMax">Maximum XP</Label>
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
                          Cooldown (seconds)
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
                      <CardTitle className="text-base">Voice</CardTitle>
                      <CardDescription>
                        XP per minute in voice channels (not muted/deafened).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <Label htmlFor="voiceXpPerMinute">XP per minute</Label>
                          <p className="text-xs text-muted-foreground">
                            Only counts members active in voice.
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
                      {config.voiceEnabled ? (
                        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                          <div className="min-w-0 space-y-0.5">
                            <Label htmlFor="streamMultiplier">
                              Screen-share bonus (Stream)
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              E.g.: 1.5 gives 50% more XP per minute while
                              streaming.
                            </p>
                          </div>
                          <div className="relative shrink-0">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              x
                            </span>
                            <Input
                              id="streamMultiplier"
                              type="number"
                              min={0.1}
                              max={20}
                              step={0.1}
                              className="h-9 w-24 pl-6"
                              value={config.streamMultiplier}
                              onChange={(e) =>
                                patch({
                                  streamMultiplier:
                                    Number(e.target.value) || 1,
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Multiplier</CardTitle>
                      <CardDescription>
                        Global XP scale (text and voice).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="xpMultiplier">Base multiplier</Label>
                        <Input
                          id="xpMultiplier"
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          className="h-9 w-24"
                          value={config.xpMultiplier}
                          onChange={(e) =>
                            patch({
                              xpMultiplier: Math.min(
                                10,
                                Math.max(
                                  1,
                                  Math.round(Number(e.target.value)) || 1,
                                ),
                              ),
                            })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Extra Multipliers
                      </CardTitle>
                      <CardDescription>
                        Configure XP bonuses per role or hot zones per
                        channel. Bonuses add to the base multiplier.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs className="w-full">
                        <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
                          <TabsTrigger
                            type="button"
                            active={multipliersTab === "roles"}
                            onClick={() => setMultipliersTab("roles")}
                          >
                            By Role
                          </TabsTrigger>
                          <TabsTrigger
                            type="button"
                            active={multipliersTab === "channels"}
                            onClick={() => setMultipliersTab("channels")}
                          >
                            By Channel
                          </TabsTrigger>
                        </TabsList>

                        {multipliersTab === "roles" ? (
                          <TabsContent className="mt-3 space-y-3">
                            {config.customMultipliers.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                                No multipliers yet. Add the first one below.
                              </p>
                            ) : (
                              config.customMultipliers.map((entry, index) => {
                                const selectedRole = multiplierRoles.find(
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
                                              color={roleDotColor(
                                                selectedRole,
                                              )}
                                            />
                                            <span className="truncate">
                                              @{selectedRole.name}
                                            </span>
                                          </span>
                                        ) : (
                                          <SelectValue placeholder="Select role" />
                                        )}
                                      </SelectTrigger>
                                      <SelectContent>
                                        {multiplierRoles.map((role) => (
                                          <SelectItem
                                            key={role.id}
                                            value={role.id}
                                          >
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
                                      earns
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
                                      aria-label="Delete multiplier"
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
                              Add multiplier
                            </Button>
                          </TabsContent>
                        ) : null}

                        {multipliersTab === "channels" ? (
                          <TabsContent className="mt-3 space-y-3">
                            {config.customChannelMultipliers.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                                No hot zones yet. Add the first one below.
                              </p>
                            ) : (
                              config.customChannelMultipliers.map(
                                (entry, index) => {
                                  const selectedChannel =
                                    multiplierChannels.find(
                                      (c) => c.id === entry.channelId,
                                    );
                                  const voice =
                                    selectedChannel &&
                                    isVoiceChannelType(selectedChannel.type);
                                  return (
                                    <div
                                      key={`ch-mult-${index}-${entry.channelId || "new"}`}
                                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5"
                                    >
                                      <Select
                                        value={entry.channelId || undefined}
                                        onValueChange={(channelId) =>
                                          updateChannelMultiplier(index, {
                                            channelId,
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-9 min-w-[160px] flex-1">
                                          {selectedChannel ? (
                                            <span className="flex min-w-0 items-center gap-2">
                                              {voice ? (
                                                <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
                                              ) : (
                                                <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                                              )}
                                              <span className="truncate">
                                                {selectedChannel.name}
                                              </span>
                                            </span>
                                          ) : (
                                            <SelectValue placeholder="Select channel" />
                                          )}
                                        </SelectTrigger>
                                        <SelectContent>
                                          {multiplierChannels.map((ch) => {
                                            const chVoice = isVoiceChannelType(
                                              ch.type,
                                            );
                                            return (
                                              <SelectItem
                                                key={ch.id}
                                                value={ch.id}
                                              >
                                                <span className="flex items-center gap-2">
                                                  {chVoice ? (
                                                    <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
                                                  ) : (
                                                    <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                                                  )}
                                                  {ch.name}
                                                </span>
                                              </SelectItem>
                                            );
                                          })}
                                        </SelectContent>
                                      </Select>
                                      <span className="text-sm text-muted-foreground">
                                        earns
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
                                            updateChannelMultiplier(index, {
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
                                        aria-label="Delete channel multiplier"
                                        onClick={() =>
                                          removeChannelMultiplier(index)
                                        }
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </div>
                                  );
                                },
                              )
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full sm:w-auto"
                              onClick={addChannelMultiplier}
                            >
                              <Plus className="size-4" />
                              Add multiplier
                            </Button>
                          </TabsContent>
                        ) : null}
                      </Tabs>
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
                      Role rewards
                    </CardTitle>
                    <CardDescription>
                      Reaching a level grants the role (cumulative if several
                      levels are gained at once).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {config.rewards.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                        No rewards yet. Add the first one below.
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
                              On reaching level
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
                              grant role
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
                                  <SelectValue placeholder="Select role" />
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
                              aria-label="Delete reward"
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
                      Add reward
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
                          Leaderboard (Top {LEADERBOARD_LIMIT})
                        </CardTitle>
                        <CardDescription>
                          {leaderboardTotal > 0
                            ? `${Math.min(leaderboard.length, LEADERBOARD_LIMIT)} of ${leaderboardTotal} users with XP.`
                            : "Users sorted by total XP."}
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
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {leaderboardLoading && leaderboard.length === 0 ? (
                      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading leaderboard…
                      </div>
                    ) : (
                      <DataTable
                        columns={leaderboardColumns}
                        data={leaderboard}
                        emptyMessage="Nobody has XP yet."
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
                        Discord Channels
                      </CardTitle>
                      <CardDescription>
                        Live leaderboard (Top 10) and level-up announcements.
                        The message is updated with an anti-rate-limit
                        debounce.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="liveLbChannel">
                          Live Leaderboard channel
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
                            <SelectValue placeholder="No channel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No channel</SelectItem>
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
                          Level-Up channel
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
                            <SelectValue placeholder="No channel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No channel</SelectItem>
                            {textChannels.map((ch) => (
                              <SelectItem key={ch.id} value={ch.id}>
                                #{ch.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          If there's no channel, the level-up announcement
                          isn't sent. Text and announcements; no forums.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Embed appearance
                      </CardTitle>
                      <CardDescription>
                        Title, text, and color that Discord actually uses.
                        Tokens: {"{user}"} {"{username}"} {"{level}"}{" "}
                        {"{server}"} {"{xp}"}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                        <div className="space-y-1.5">
                          <Label>Level-up color</Label>
                          <Input
                            type="color"
                            className="h-10 w-14 cursor-pointer p-1"
                            value={config.levelUpEmbedColor || "#34E21D"}
                            onChange={(e) =>
                              patch({ levelUpEmbedColor: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="levelUpTitle">Level-up title</Label>
                          <Input
                            id="levelUpTitle"
                            maxLength={256}
                            value={config.levelUpEmbedTitle}
                            onChange={(e) =>
                              patch({ levelUpEmbedTitle: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="levelUpMessage">
                          Level-up description
                        </Label>
                        <Textarea
                          id="levelUpMessage"
                          rows={3}
                          maxLength={2000}
                          value={config.levelUpMessage}
                          onChange={(e) =>
                            patch({ levelUpMessage: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">
                            User thumbnail
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Avatar in the level-up embed.
                          </p>
                        </div>
                        <Switch
                          checked={config.levelUpShowThumbnail}
                          onCheckedChange={(levelUpShowThumbnail) =>
                            patch({ levelUpShowThumbnail })
                          }
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                        <div className="space-y-1.5">
                          <Label>Leaderboard color</Label>
                          <Input
                            type="color"
                            className="h-10 w-14 cursor-pointer p-1"
                            value={config.leaderboardEmbedColor || "#CA7AFF"}
                            onChange={(e) =>
                              patch({
                                leaderboardEmbedColor: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="lbTitle">
                            Leaderboard title
                          </Label>
                          <Input
                            id="lbTitle"
                            maxLength={256}
                            value={config.leaderboardEmbedTitle}
                            onChange={(e) =>
                              patch({
                                leaderboardEmbedTitle: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lbDesc">
                          Leaderboard intro (optional)
                        </Label>
                        <Textarea
                          id="lbDesc"
                          rows={2}
                          maxLength={500}
                          value={config.leaderboardEmbedDescription}
                          placeholder="{total} members with XP"
                          onChange={(e) =>
                            patch({
                              leaderboardEmbedDescription: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">
                            Server thumbnail
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Guild icon in the live leaderboard.
                          </p>
                        </div>
                        <Switch
                          checked={config.leaderboardShowThumbnail}
                          onCheckedChange={(leaderboardShowThumbnail) =>
                            patch({ leaderboardShowThumbnail })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Exclusions</CardTitle>
                      <CardDescription>
                        Roles and channels where no XP is earned.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RoleMultiSelect
                        label="Ignored roles"
                        roles={assignableRoles}
                        value={config.ignoredRoles}
                        onChange={(ignoredRoles) => patch({ ignoredRoles })}
                      />
                      <ChannelMultiSelect
                        label="Ignored channels / categories"
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
                  Discord preview or data summary.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
                  <TabsTrigger
                    className="w-full"
                    active={monitorSideTab === "preview"}
                    onClick={() => setMonitorSideTab("preview")}
                  >
                    Preview
                  </TabsTrigger>
                  <TabsTrigger
                    className="w-full"
                    active={monitorSideTab === "datos"}
                    onClick={() => setMonitorSideTab("datos")}
                  >
                    Data
                  </TabsTrigger>
                </TabsList>

                {monitorSideTab === "preview" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Level announcement
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
                    Save configuration
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" />
                  Status monitor
                </CardTitle>
                <CardDescription>Live summary of the config.</CardDescription>
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
        <span className="text-muted-foreground">Overall status</span>
        <Badge
          className={cn(
            "normal-case tracking-normal",
            config.enabled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {config.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Base multiplier</span>
        <span className="font-mono text-xs">
          {config.xpMultiplier}x
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Rewards</span>
        <span className="font-mono text-xs">{config.rewards.length}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Text XP</span>
        <span className="font-mono text-xs">
          {config.textXpMin}–{config.textXpMax}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Stream bonus</span>
        <span className="font-mono text-xs">
          {Number(config.streamMultiplier ?? 1).toFixed(1)}x
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Hot zones</span>
        <span className="font-mono text-xs">
          {(config.customChannelMultipliers ?? []).length}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Live leaderboard</span>
        <span className="max-w-[140px] truncate text-right text-xs">
          {liveChannelLabel}
        </span>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground/80">
          <Info className="size-3.5" />
          Level formula
        </div>
        <code className="text-[10px]">floor(0.1 × √totalXp)</code>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <p className="mb-2 text-[11px] font-medium text-foreground/80">
          XP curve (Preview)
        </p>
        <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
          {[1, 2, 3, 4, 5].map((level) => (
            <li
              key={level}
              className="flex items-center justify-between gap-2"
            >
              <span>Level {level}</span>
              <span>{calculateBaseXPForLevel(level).toLocaleString("en-US")} XP</span>
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
        Save configuration
      </Button>
    </div>
  );
}
