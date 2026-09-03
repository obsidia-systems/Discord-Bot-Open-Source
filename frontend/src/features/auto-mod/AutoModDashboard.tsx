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
  fetchLevelsConfig,
  saveAutoModConfig,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Info, Loader2, Save, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AutoModExclusionsTab } from "./AutoModExclusionsTab";
import { AutoModFiltersTab } from "./AutoModFiltersTab";
import { AutoModSanctionsTab } from "./AutoModSanctionsTab";

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
    warnOnHit: config.warnOnHit,
    dmOnHit: config.dmOnHit,
    skipStaff: config.skipStaff,
    punishments: config.punishments,
  });
}

function warnDecayLabel(days: AutoModWarnDecayDays): string {
  return (
    AUTO_MOD_WARN_DECAY_OPTIONS.find((o) => o.value === days)?.label ??
    `${days} days`
  );
}

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
  const [levelsEnabled, setLevelsEnabled] = useState(false);
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
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
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
      const [cfgRes, assets, levelsRes] = await Promise.all([
        fetchAutoModConfig(),
        fetchGuildAssets(),
        fetchLevelsConfig().catch(() => null),
      ]);
      setConfig(cfgRes.config);
      setSavedFingerprint(configFingerprint(cfgRes.config));
      setChannels(assets.channels);
      setRoles(assets.roles);
      setLevelsEnabled(Boolean(levelsRes?.config.enabled));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load Auto-Mod",
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
        warnOnHit: config.warnOnHit,
        dmOnHit: config.dmOnHit,
        skipStaff: config.skipStaff,
        punishments: config.punishments,
      });
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      if (res.nativeSync && !res.nativeSync.ok) {
        setSuccess("Auto-Mod configuration saved.");
        setError(res.nativeSync.message);
      } else {
        setSuccess(
          res.nativeSync?.message
            ? `Configuration saved. ${res.nativeSync.message}`
            : "Auto-Mod configuration saved.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save Auto-Mod",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading Auto-Mod…
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
                Filters and Rules
              </TabsTrigger>
              <TabsTrigger
                active={tab === "sanctions"}
                onClick={() => setTab("sanctions")}
              >
                Sanction System
              </TabsTrigger>
              <TabsTrigger
                active={tab === "exclusions"}
                onClick={() => setTab("exclusions")}
              >
                Exclusions and Logs
              </TabsTrigger>
            </TabsList>

            {tab === "filters" ? (
              <TabsContent>
                <AutoModFiltersTab
                  filters={config.filters}
                  onChange={patchFilters}
                />
              </TabsContent>
            ) : null}

            {tab === "sanctions" ? (
              <TabsContent>
                <AutoModSanctionsTab
                  config={config}
                  levelsEnabled={levelsEnabled}
                  onPatch={patch}
                />
              </TabsContent>
            ) : null}

            {tab === "exclusions" ? (
              <TabsContent>
                <AutoModExclusionsTab
                  config={config}
                  assignableRoles={assignableRoles}
                  ignoreChannels={ignoreChannels}
                  textChannels={textChannels}
                  onPatch={patch}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <div className="sticky top-6 flex flex-col gap-4 self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-primary" aria-hidden />
                Status monitor
              </CardTitle>
              <CardDescription>
                Live summary before saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Overall status</span>
                <Badge
                  className={
                    config.enabled
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : undefined
                  }
                >
                  {config.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Active filters</span>
                <span className="font-mono text-xs">
                  {activeFilterCount} / {AUTO_MOD_TOGGLE_FILTER_COUNT}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">On filter</span>
                <span className="text-xs">
                  {config.warnOnHit
                    ? config.dmOnHit
                      ? "Block + warn + DM"
                      : "Block + warn"
                    : "Block only"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Exclusions</span>
                <span className="text-xs">
                  {config.ignoredChannels.length} channels ·{" "}
                  {config.ignoredRoles.length} roles
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Alerts</span>
                <span className="truncate text-xs">
                  {config.logChannelId
                    ? `#${textChannels.find((c) => c.id === config.logChannelId)?.name ?? config.logChannelId}`
                    : "Action Logs fallback"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Decay</span>
                <span className="text-xs">
                  {warnDecayLabel(config.warnDecayDays)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Sanctions</span>
                <span className="font-mono text-xs">
                  {config.punishments.length}
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
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden />
                    Save configuration
                  </>
                )}
              </Button>

              {!dirty ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  No pending changes.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
              <Info
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <p className={cn("leading-relaxed")}>
                On save, Adobos writes native AutoMod rules (words, invites,
                mentions) so Discord blocks before the message is seen. Warns
                and escalation stay in the bot.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
