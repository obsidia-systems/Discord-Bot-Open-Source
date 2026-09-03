import type {
  GuildChannelAsset,
  GuildRoleAsset,
  StreamAlert,
  StreamAlertCredentials,
  StreamAlertPlatform,
} from "@adobos/shared";
import {
  STREAM_ALERT_DEFAULT_TEMPLATE,
  STREAM_ALERT_PLATFORM_LABEL,
  STREAM_ALERT_PLATFORMS,
  STREAM_ALERT_TEMPLATE_MAX,
  isStreamAlertDestinationChannelType,
} from "@adobos/shared";
import {
  createStreamAlert,
  deleteStreamAlert,
  fetchGuildAssets,
  fetchStreamAlerts,
  updateStreamAlert,
} from "@/lib/api";
import { useEntitlements } from "@/features/entitlements/useEntitlements";
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
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

const NONE = "__none__";

type Draft = {
  platform: StreamAlertPlatform;
  handle: string;
  discordChannelId: string;
  mentionRoleId: string;
  template: string;
  enabled: boolean;
};

function emptyDraft(): Draft {
  return {
    platform: "twitch",
    handle: "",
    discordChannelId: "",
    mentionRoleId: "",
    template: STREAM_ALERT_DEFAULT_TEMPLATE,
    enabled: true,
  };
}

function toDraft(alert: StreamAlert): Draft {
  return {
    platform: alert.platform,
    handle: alert.handle,
    discordChannelId: alert.discordChannelId,
    mentionRoleId: alert.mentionRoleId ?? "",
    template: alert.template,
    enabled: alert.enabled,
  };
}

export function StreamAlertsDashboard() {
  const { limitOf, isUnlimited } = useEntitlements();
  const [alerts, setAlerts] = useState<StreamAlert[]>([]);
  const [credentials, setCredentials] = useState<StreamAlertCredentials>({
    twitch: false,
    youtube: false,
    kick: true,
  });
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [creating, setCreating] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cap = limitOf("streamAlerts");
  const atLimit = !isUnlimited("streamAlerts") && alerts.length >= cap;

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => isStreamAlertDestinationChannelType(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const mentionRoles = useMemo(
    () => roles.filter((role) => role.name !== "@everyone"),
    [roles],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, assets] = await Promise.all([
        fetchStreamAlerts(),
        fetchGuildAssets(),
      ]);
      setAlerts(config.alerts);
      setCredentials(config.credentials);
      setDrafts(
        Object.fromEntries(config.alerts.map((row) => [row.id, toDraft(row)])),
      );
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

  function payload(draft: Draft) {
    return {
      platform: draft.platform,
      handle: draft.handle,
      discordChannelId: draft.discordChannelId,
      mentionRoleId: draft.mentionRoleId || null,
      template: draft.template,
      enabled: draft.enabled,
    };
  }

  async function onCreate(): Promise<void> {
    if (!creating) return;
    if (!creating.handle.trim() || !creating.discordChannelId) {
      setError("Pick a platform, a Discord channel, and the handle or URL.");
      return;
    }
    setSavingId("new");
    setError(null);
    setSuccess(null);
    try {
      await createStreamAlert(payload(creating));
      setCreating(null);
      setSuccess("Alerta creada. El bot avisa al pasar a en directo.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't create.");
    } finally {
      setSavingId(null);
    }
  }

  async function onSave(id: number): Promise<void> {
    const draft = drafts[id];
    if (!draft?.handle.trim() || !draft.discordChannelId) {
      setError("Pick a platform, a Discord channel, and the handle or URL.");
      return;
    }
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await updateStreamAlert(id, payload(draft));
      setSuccess("Alerta guardada.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingId(null);
    }
  }

  async function onDelete(id: number): Promise<void> {
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await deleteStreamAlert(id);
      setSuccess("Alerta borrada.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setSavingId(null);
    }
  }

  function openCreate(): void {
    if (atLimit) {
      setError(
        `You've reached this plan's limit of ${cap} Stream Alerts.`,
      );
      return;
    }
    setCreating(emptyDraft());
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Loading Stream Alerts…
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
          <CardTitle>Stream Alerts</CardTitle>
          <CardDescription>
            The bot checks Twitch, YouTube, and Kick and alerts in Discord only
            when a channel goes from offline to live. This isn't Action Logs or a
            scheduled event announcement. TikTok is out of scope for this wave.
            {" "}
            {isUnlimited("streamAlerts")
              ? `${alerts.length} alerts.`
              : `${alerts.length} / ${cap} alerts.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {!credentials.twitch ? (
            <p>
              Twitch: add <code>TWITCH_CLIENT_ID</code> and{" "}
              <code>TWITCH_CLIENT_SECRET</code> to the backend environment.
            </p>
          ) : null}
          {!credentials.youtube ? (
            <p>
              YouTube: add <code>YOUTUBE_API_KEY</code> (Data API v3). Checked
              every 5 min due to quota.
            </p>
          ) : null}
          <p>Kick needs no key. The poller runs every 60 s in the worker.</p>
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            disabled={atLimit || creating !== null}
          >
            <Plus className="size-4" aria-hidden />
            New alert
          </Button>
        </CardContent>
      </Card>

      {creating ? (
        <AlertForm
          draft={creating}
          channels={textChannels}
          roles={mentionRoles}
          saving={savingId === "new"}
          onChange={setCreating}
          onSave={() => void onCreate()}
          onCancel={() => setCreating(null)}
          submitLabel="Create"
        />
      ) : null}

      {alerts.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          No alerts yet. Paste the channel URL and choose where to notify.
        </p>
      ) : (
        alerts.map((alert) => {
          const draft = drafts[alert.id] ?? toDraft(alert);
          return (
            <div key={alert.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 px-1">
                <Badge
                  className={
                    alert.isLive
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : undefined
                  }
                >
                  {alert.isLive ? "Live" : "Offline"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {STREAM_ALERT_PLATFORM_LABEL[alert.platform]} ·{" "}
                  {alert.displayName || alert.handle}
                </span>
              </div>
              <AlertForm
                draft={draft}
                channels={textChannels}
                roles={mentionRoles}
                saving={savingId === alert.id}
                onChange={(next) =>
                  setDrafts((prev) => ({ ...prev, [alert.id]: next }))
                }
                onSave={() => void onSave(alert.id)}
                onDelete={() => void onDelete(alert.id)}
                submitLabel="Save"
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function AlertForm({
  draft,
  channels,
  roles,
  saving,
  onChange,
  onSave,
  onCancel,
  onDelete,
  submitLabel,
}: {
  draft: Draft;
  channels: GuildChannelAsset[];
  roles: GuildRoleAsset[];
  saving: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const enabledId = useId();
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select
              value={draft.platform}
              onValueChange={(value) =>
                onChange({ ...draft, platform: value as StreamAlertPlatform })
              }
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STREAM_ALERT_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {STREAM_ALERT_PLATFORM_LABEL[platform]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Channel / handle / URL</Label>
            <Input
              value={draft.handle}
              disabled={saving}
              placeholder="https://twitch.tv/name or @handle"
              onChange={(event) =>
                onChange({ ...draft, handle: event.target.value })
              }
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Discord channel</Label>
            <Select
              value={draft.discordChannelId || NONE}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  discordChannelId: value === NONE ? "" : value,
                })
              }
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Pick a channel</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mention role (optional)</Label>
            <Select
              value={draft.mentionRoleId || NONE}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  mentionRoleId: value === NONE ? "" : value,
                })
              }
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="No mention" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No mention</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    @{role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Template</Label>
          <Textarea
            value={draft.template}
            maxLength={STREAM_ALERT_TEMPLATE_MAX}
            disabled={saving}
            onChange={(event) =>
              onChange({ ...draft, template: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Placeholders: {"{name}"} {"{title}"} {"{url}"} {"{game}"} {"{handle}"}{" "}
            {"{platform}"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Switch
            id={enabledId}
            checked={draft.enabled}
            onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
            disabled={saving}
          />
          <Label htmlFor={enabledId}>Enabled</Label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {submitLabel}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
