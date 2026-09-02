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
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
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
      setError("Elige plataforma, canal de Discord y el handle o URL.");
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
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setSavingId(null);
    }
  }

  async function onSave(id: number): Promise<void> {
    const draft = drafts[id];
    if (!draft?.handle.trim() || !draft.discordChannelId) {
      setError("Elige plataforma, canal de Discord y el handle o URL.");
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
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
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
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setSavingId(null);
    }
  }

  function openCreate(): void {
    if (atLimit) {
      setError(
        `Has alcanzado el límite de ${cap} Stream Alerts de este plan.`,
      );
      return;
    }
    setCreating(emptyDraft());
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando Stream Alerts…
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
            El bot comprueba Twitch, YouTube y Kick y avisa en Discord solo al
            pasar de offline a en directo. No es Action Logs ni un anuncio de
            evento programado. TikTok queda fuera de esta oleada.
            {" "}
            {isUnlimited("streamAlerts")
              ? `${alerts.length} alertas.`
              : `${alerts.length} / ${cap} alertas.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {!credentials.twitch ? (
            <p>
              Twitch: añade <code>TWITCH_CLIENT_ID</code> y{" "}
              <code>TWITCH_CLIENT_SECRET</code> al entorno del backend.
            </p>
          ) : null}
          {!credentials.youtube ? (
            <p>
              YouTube: añade <code>YOUTUBE_API_KEY</code> (Data API v3). Se
              comprueba cada 5 min por cuota.
            </p>
          ) : null}
          <p>Kick no necesita clave. El poller corre cada 60 s en el worker.</p>
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            disabled={atLimit || creating !== null}
          >
            <Plus className="size-4" aria-hidden />
            Nueva alerta
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
          submitLabel="Crear"
        />
      ) : null}

      {alerts.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay alertas. Pega la URL del canal y elige dónde avisar.
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
                  {alert.isLive ? "En directo" : "Offline"}
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
                submitLabel="Guardar"
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
            <Label>Plataforma</Label>
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
            <Label>Canal / handle / URL</Label>
            <Input
              value={draft.handle}
              disabled={saving}
              placeholder="https://twitch.tv/nombre o @handle"
              onChange={(event) =>
                onChange({ ...draft, handle: event.target.value })
              }
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Canal de Discord</Label>
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
                <SelectValue placeholder="Elige un canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Elige un canal</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mencionar rol (opcional)</Label>
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
                <SelectValue placeholder="Sin mención" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin mención</SelectItem>
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
          <Label>Plantilla</Label>
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
          <Label htmlFor={enabledId}>Activa</Label>
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
              Cancelar
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
              Borrar
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
