import type {
  Giveaway,
  GiveawayDetail,
  GiveawaySettings,
  GiveawayStatus,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import { GIVEAWAY_STATUS_LABEL, GIVEAWAYS_MAX_RUNNING } from "@adobos/shared";
import {
  cancelGiveaway,
  createGiveaway,
  endGiveaway,
  fetchGiveawayDetail,
  fetchGiveawaySettings,
  fetchGiveaways,
  fetchGuildAssets,
  publishGiveaway,
  rerollGiveaway,
  saveGiveawaySettings,
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
import { Dialog } from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { Loader2, Plus, Save, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const TEXT_CHANNEL_TYPES = new Set([0, 5]);

function statusClass(status: GiveawayStatus): string {
  if (status === "running") return "border-emerald-500/40 text-emerald-300";
  if (status === "scheduled") return "border-sky-500/40 text-sky-300";
  if (status === "ended") return "border-zinc-500/40 text-zinc-400";
  return "border-red-500/40 text-red-300";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function GiveawaysDashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [settings, setSettings] = useState<GiveawaySettings | null>(null);
  const [rows, setRows] = useState<Giveaway[]>([]);
  const [detail, setDetail] = useState<GiveawayDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [winnerCount, setWinnerCount] = useState(1);
  const [requiredRoleIds, setRequiredRoleIds] = useState<string[]>([]);
  const [blockedRoleIds, setBlockedRoleIds] = useState<string[]>([]);
  const [minGuildAgeDays, setMinGuildAgeDays] = useState(0);
  const [minAccountAgeDays, setMinAccountAgeDays] = useState(0);

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );
  const mentionRoles = useMemo(
    () => roles.filter((role) => role.name !== "@everyone"),
    [roles],
  );
  const runningCount = rows.filter((row) => row.status === "running").length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assets, cfg, list] = await Promise.all([
        fetchGuildAssets(),
        fetchGiveawaySettings(),
        fetchGiveaways(),
      ]);
      setChannels(assets.channels);
      setRoles(assets.roles);
      setSettings(cfg.settings);
      setRows(list.giveaways);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Couldn't load Giveaways.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy(fn: () => Promise<void>, ok?: string): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      if (ok) setSuccess(ok);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: number): Promise<void> {
    try {
      const res = await fetchGiveawayDetail(id);
      setDetail(res.giveaway);
      setDetailOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't open.");
    }
  }

  async function refreshList(): Promise<void> {
    const list = await fetchGiveaways();
    setRows(list.giveaways);
    if (detail) {
      const res = await fetchGiveawayDetail(detail.id);
      setDetail(res.giveaway);
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Giveaways…
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          <CardTitle>New giveaway</CardTitle>
          <CardDescription>
            Enter button in Discord. Entries live here, not in a
            reaction. {runningCount}/{GIVEAWAYS_MAX_RUNNING} running.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gw-prize">Prize</Label>
            <Input
              id="gw-prize"
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              placeholder="Nitro, role, etc."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gw-desc">Description</Label>
            <Textarea
              id="gw-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select
                value={channelId ?? "__none__"}
                onValueChange={(v) => setChannelId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {textChannels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      #{ch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gw-mins">Duration (minutes)</Label>
              <Input
                id="gw-mins"
                type="number"
                min={1}
                max={43200}
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(Number.parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gw-winners">Winners</Label>
              <Input
                id="gw-winners"
                type="number"
                min={1}
                max={20}
                value={winnerCount}
                onChange={(e) =>
                  setWinnerCount(Number.parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
          </div>
          <RoleMultiSelect
            label="Required roles"
            roles={mentionRoles}
            value={requiredRoleIds}
            onChange={setRequiredRoleIds}
          />
          <RoleMultiSelect
            label="Blocked roles"
            roles={mentionRoles}
            value={blockedRoleIds}
            onChange={setBlockedRoleIds}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gw-guild-age">Minimum days in the server</Label>
              <Input
                id="gw-guild-age"
                type="number"
                min={0}
                max={365}
                value={minGuildAgeDays}
                onChange={(e) =>
                  setMinGuildAgeDays(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gw-acct-age">Minimum account age (days)</Label>
              <Input
                id="gw-acct-age"
                type="number"
                min={0}
                max={365}
                value={minAccountAgeDays}
                onChange={(e) =>
                  setMinAccountAgeDays(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
          </div>
          <Button
            disabled={saving || !prize.trim() || !channelId}
            onClick={() =>
              void withBusy(async () => {
                if (!channelId) return;
                await createGiveaway({
                  channelId,
                  prize: prize.trim(),
                  description,
                  durationMinutes,
                  winnerCount,
                  requiredRoleIds,
                  blockedRoleIds,
                  minGuildAgeDays,
                  minAccountAgeDays,
                });
                setPrize("");
                setDescription("");
                await refreshList();
              }, "Giveaway published.")
            }
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Publish
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            DM to the winner and role pinged when it ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RoleMultiSelect
            label="Manager roles (in addition to Manage Guild)"
            roles={mentionRoles}
            value={settings.managerRoleIds}
            onChange={(managerRoleIds) =>
              setSettings({ ...settings, managerRoleIds })
            }
          />
          <div className="space-y-1.5">
            <Label>Role to ping when it ends</Label>
            <Select
              value={settings.pingRoleId ?? "__none__"}
              onValueChange={(v) =>
                setSettings({
                  ...settings,
                  pingRoleId: v === "__none__" ? null : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {mentionRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="gw-dm">Notify the winner by DM</Label>
            <Switch
              id="gw-dm"
              checked={settings.dmWinners}
              onCheckedChange={(dmWinners) =>
                setSettings({ ...settings, dmWinners })
              }
            />
          </div>
          <Button
            disabled={saving}
            onClick={() =>
              void withBusy(async () => {
                const saved = await saveGiveawaySettings({
                  managerRoleIds: settings.managerRoleIds,
                  pingRoleId: settings.pingRoleId,
                  dmWinners: settings.dmWinners,
                });
                setSettings(saved.settings);
              }, "Settings saved.")
            }
          >
            <Save className="size-4" />
            Save settings
          </Button>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Prize</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Entries</th>
              <th className="px-3 py-2 font-medium">Ends</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-6 text-center text-muted-foreground"
                  colSpan={4}
                >
                  No giveaways yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t hover:bg-muted/40"
                  onClick={() => void openDetail(row.id)}
                >
                  <td className="px-3 py-2 font-medium">{row.prize}</td>
                  <td className="px-3 py-2">
                    <Badge className={statusClass(row.status)}>
                      {GIVEAWAY_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{row.entryCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatWhen(row.endsAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail?.prize ?? "Giveaway"}
        description={
          detail
            ? `${GIVEAWAY_STATUS_LABEL[detail.status]} · ${detail.entryCount} participant(s)`
            : undefined
        }
        className="max-w-lg"
      >
        {detail ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ends {formatWhen(detail.endsAt)}
              {detail.messageId ? "" : " · no message in Discord"}
            </p>
            {detail.winnerIds.length > 0 ? (
              <p className="text-sm">
                Winners:{" "}
                {detail.winnerIds.map((id) => (
                  <span key={id} className="mr-2 font-mono text-xs">
                    {id}
                  </span>
                ))}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {detail.status === "running" || detail.status === "scheduled" ? (
                <>
                  {detail.status === "running" ? (
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() =>
                        void withBusy(async () => {
                          await endGiveaway(detail.id);
                          await refreshList();
                        }, "Giveaway closed.")
                      }
                    >
                      End now
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() =>
                      void withBusy(async () => {
                        await cancelGiveaway(detail.id);
                        await refreshList();
                      }, "Giveaway canceled.")
                    }
                  >
                    Cancel
                  </Button>
                </>
              ) : null}
              {detail.status === "ended" ? (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void withBusy(async () => {
                      await rerollGiveaway(detail.id);
                      await refreshList();
                    }, "Reroll done.")
                  }
                >
                  Reroll
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  void withBusy(async () => {
                    await publishGiveaway(detail.id);
                    await refreshList();
                  }, "Message republished.")
                }
              >
                <Send className="size-4" />
                Republish
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
