import type {
  AntiRaidSettings,
  GuildChannelAsset,
  GuildRoleAsset,
  NukeAction,
  NukePunishment,
  RaidAgeAction,
  RaidJoinAction,
  RaidLockdownJoinAction,
} from "@adobos/shared";
import {
  ANTI_RAID_AGE_DAYS_MAX,
  ANTI_RAID_AGE_DAYS_MIN,
  ANTI_RAID_JOIN_COUNT_MAX,
  ANTI_RAID_JOIN_COUNT_MIN,
  ANTI_RAID_WINDOW_MAX,
  ANTI_RAID_WINDOW_MIN,
  NUKE_ACTIONS,
  clampAccountAgeDays,
  clampJoinCount,
  clampRaidWindowSeconds,
  isStarboardDestinationChannelType,
  parseUserIdList,
} from "@adobos/shared";
import {
  fetchAntiRaid,
  fetchGuildAssets,
  saveAntiRaidSettings,
  setAntiRaidLockdown,
} from "@/lib/api";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
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
import { ToastBanner } from "@/components/ui/toast";
import { useEntitlements } from "@/features/entitlements/useEntitlements";
import { Loader2, Save, ShieldBan } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const NONE = "__none__";

const NUKE_LABELS: Record<NukeAction, string> = {
  channelCreate: "Create channels",
  channelDelete: "Delete channels",
  roleCreate: "Create roles",
  roleDelete: "Delete roles",
  memberBan: "Bans",
  memberKick: "Kicks",
  botAdd: "Add bots",
  webhookCreate: "Create webhooks",
};

function applySettings(
  settings: AntiRaidSettings,
  set: (s: AntiRaidSettings) => void,
): void {
  set(settings);
}

export function AntiRaidDashboard() {
  const { can } = useEntitlements();
  const nukeUnlocked = can("antinuke");
  const [settings, setSettings] = useState<AntiRaidSettings | null>(null);
  const [nukeAvailable, setNukeAvailable] = useState(false);
  const [nukeUserRaw, setNukeUserRaw] = useState("");
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => isStarboardDestinationChannelType(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, assets] = await Promise.all([
        fetchAntiRaid(),
        fetchGuildAssets(),
      ]);
      applySettings(config.settings, setSettings);
      setNukeAvailable(config.nukeAvailable);
      setNukeUserRaw(config.settings.nukeWhitelistUserIds.join(", "));
      setChannels(assets.channels);
      setRoles(assets.roles);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(partial: Partial<AntiRaidSettings>): void {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  async function onSave(): Promise<void> {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: settings.enabled,
        alertChannelId: settings.alertChannelId,
        joinFloodEnabled: settings.joinFloodEnabled,
        joinCount: settings.joinCount,
        joinWindowSeconds: settings.joinWindowSeconds,
        joinAction: settings.joinAction,
        accountAgeEnabled: settings.accountAgeEnabled,
        accountAgeDays: settings.accountAgeDays,
        accountAgeAction: settings.accountAgeAction,
        lockdownJoinAction: settings.lockdownJoinAction,
        timeoutSeconds: settings.timeoutSeconds,
        whitelistRoleIds: settings.whitelistRoleIds,
      };
      if (nukeUnlocked) {
        payload.nukeEnabled = settings.nukeEnabled;
        payload.nukeWindowSeconds = settings.nukeWindowSeconds;
        payload.nukePunishment = settings.nukePunishment;
        payload.nukeThresholds = settings.nukeThresholds;
        payload.nukeWhitelistUserIds = parseUserIdList(nukeUserRaw);
        payload.nukeWhitelistRoleIds = settings.nukeWhitelistRoleIds;
      }
      const next = await saveAntiRaidSettings(payload);
      applySettings(next, setSettings);
      setNukeUserRaw(next.nukeWhitelistUserIds.join(", "));
      setSuccess("Settings saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function onLockdown(active: boolean): Promise<void> {
    setLocking(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await setAntiRaidLockdown(active);
      applySettings(next.settings, setSettings);
      setNukeAvailable(next.nukeAvailable);
      setSuccess(active ? "Lockdown active." : "Lockdown removed.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't change.");
    } finally {
      setLocking(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Loading Anti-Raid…
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

      <Card>
        <CardHeader>
          <CardTitle>Raid protection</CardTitle>
          <CardDescription>
            Join floods and new accounts. This isn't Auto-Mod (that filters
            messages) or Action Logs (that only records). Emergency
            lockdown: {settings.lockdownActive ? "active" : "off"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="raid-enabled"
              checked={settings.enabled}
              onCheckedChange={(enabled) => patch({ enabled })}
            />
            <Label htmlFor="raid-enabled">Enabled</Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="raid-alert">Alert channel</Label>
            <Select
              value={settings.alertChannelId ?? NONE}
              onValueChange={(value) =>
                patch({ alertChannelId: value === NONE ? null : value })
              }
              disabled={saving}
            >
              <SelectTrigger id="raid-alert">
                <SelectValue placeholder="No channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No channel</SelectItem>
                {textChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <RoleMultiSelect
            id="raid-whitelist"
            label="Exempt roles (joins)"
            roles={roles}
            value={settings.whitelistRoleIds}
            onChange={(whitelistRoleIds) => patch({ whitelistRoleIds })}
            disabled={saving}
            emptyHint="Nobody is exempt except the server owner."
          />

          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="raid-flood"
              checked={settings.joinFloodEnabled}
              onCheckedChange={(joinFloodEnabled) =>
                patch({ joinFloodEnabled })
              }
            />
            <Label htmlFor="raid-flood">Join flood</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="raid-joins">Joins</Label>
              <Input
                id="raid-joins"
                type="number"
                min={ANTI_RAID_JOIN_COUNT_MIN}
                max={ANTI_RAID_JOIN_COUNT_MAX}
                value={settings.joinCount}
                disabled={saving}
                onChange={(event) =>
                  patch({ joinCount: clampJoinCount(event.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raid-window">Window (s)</Label>
              <Input
                id="raid-window"
                type="number"
                min={ANTI_RAID_WINDOW_MIN}
                max={ANTI_RAID_WINDOW_MAX}
                value={settings.joinWindowSeconds}
                disabled={saving}
                onChange={(event) =>
                  patch({
                    joinWindowSeconds: clampRaidWindowSeconds(
                      event.target.value,
                    ),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raid-join-action">Action</Label>
              <Select
                value={settings.joinAction}
                onValueChange={(value) =>
                  patch({ joinAction: value as RaidJoinAction })
                }
                disabled={saving}
              >
                <SelectTrigger id="raid-join-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kick">Kick</SelectItem>
                  <SelectItem value="ban">Ban</SelectItem>
                  <SelectItem value="lockdown">Kick + lockdown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="raid-age"
              checked={settings.accountAgeEnabled}
              onCheckedChange={(accountAgeEnabled) =>
                patch({ accountAgeEnabled })
              }
            />
            <Label htmlFor="raid-age">Minimum account age</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="raid-days">
                Days ({ANTI_RAID_AGE_DAYS_MIN}–{ANTI_RAID_AGE_DAYS_MAX})
              </Label>
              <Input
                id="raid-days"
                type="number"
                min={ANTI_RAID_AGE_DAYS_MIN}
                max={ANTI_RAID_AGE_DAYS_MAX}
                value={settings.accountAgeDays}
                disabled={saving}
                onChange={(event) =>
                  patch({
                    accountAgeDays: clampAccountAgeDays(event.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raid-age-action">Action</Label>
              <Select
                value={settings.accountAgeAction}
                onValueChange={(value) =>
                  patch({ accountAgeAction: value as RaidAgeAction })
                }
                disabled={saving}
              >
                <SelectTrigger id="raid-age-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kick">Kick</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="raid-lock-join">During lockdown, new joins</Label>
            <Select
              value={settings.lockdownJoinAction}
              onValueChange={(value) =>
                patch({
                  lockdownJoinAction: value as RaidLockdownJoinAction,
                })
              }
              disabled={saving}
            >
              <SelectTrigger id="raid-lock-join">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timeout">Timeout</SelectItem>
                <SelectItem value="kick">Kick</SelectItem>
                <SelectItem value="none">Leave alone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={settings.lockdownActive ? "outline" : "default"}
              disabled={locking}
              onClick={() => void onLockdown(!settings.lockdownActive)}
            >
              {locking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldBan className="size-4" />
              )}
              {settings.lockdownActive ? "Remove lockdown" : "Enable lockdown"}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void onSave()}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can also use <code>/lockdown on</code> or{" "}
            <code>/lockdown off</code> in Discord (it may take ~1 h to
            appear the first time).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anti-Nuke</CardTitle>
          <CardDescription>
            If a staff member or a bot starts deleting channels, roles, or
            mass-banning, dangerous permissions are removed. Pro plan.
            {nukeAvailable ? "" : " This server is on Free."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!nukeUnlocked ? (
            <p className="text-sm text-muted-foreground">
              This feature requires the Pro plan. The basic raid protection
              above is still available.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  id="nuke-enabled"
                  checked={settings.nukeEnabled}
                  onCheckedChange={(nukeEnabled) => patch({ nukeEnabled })}
                />
                <Label htmlFor="nuke-enabled">Enabled</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nuke-window">Window (s)</Label>
                  <Input
                    id="nuke-window"
                    type="number"
                    min={ANTI_RAID_WINDOW_MIN}
                    max={ANTI_RAID_WINDOW_MAX}
                    value={settings.nukeWindowSeconds}
                    disabled={saving}
                    onChange={(event) =>
                      patch({
                        nukeWindowSeconds: clampRaidWindowSeconds(
                          event.target.value,
                        ),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nuke-punish">Punishment</Label>
                  <Select
                    value={settings.nukePunishment}
                    onValueChange={(value) =>
                      patch({ nukePunishment: value as NukePunishment })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger id="nuke-punish">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strip">Remove dangerous roles</SelectItem>
                      <SelectItem value="kick">Kick</SelectItem>
                      <SelectItem value="ban">Ban</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {NUKE_ACTIONS.map((action) => (
                  <div key={action} className="space-y-1.5">
                    <Label htmlFor={`nuke-${action}`}>{NUKE_LABELS[action]}</Label>
                    <Input
                      id={`nuke-${action}`}
                      type="number"
                      min={1}
                      max={50}
                      value={settings.nukeThresholds[action]}
                      disabled={saving}
                      onChange={(event) =>
                        patch({
                          nukeThresholds: {
                            ...settings.nukeThresholds,
                            [action]: Number.parseInt(event.target.value, 10) || 1,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <RoleMultiSelect
                id="nuke-roles"
                label="Exempt roles (nuke)"
                roles={roles}
                value={settings.nukeWhitelistRoleIds}
                onChange={(nukeWhitelistRoleIds) =>
                  patch({ nukeWhitelistRoleIds })
                }
                disabled={saving}
                emptyHint="Only the owner is exempt."
              />
              <div className="space-y-1.5">
                <Label htmlFor="nuke-users">Exempt users (IDs)</Label>
                <Input
                  id="nuke-users"
                  value={nukeUserRaw}
                  disabled={saving}
                  placeholder="123456789012345678, …"
                  onChange={(event) => setNukeUserRaw(event.target.value)}
                />
              </div>
              <Button type="button" disabled={saving} onClick={() => void onSave()}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save Anti-Nuke
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
