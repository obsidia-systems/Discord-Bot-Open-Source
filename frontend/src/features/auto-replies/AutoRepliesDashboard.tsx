import type {
  AutoReply,
  AutoReplyMatchMode,
  GuildChannelAsset,
} from "@adobos/shared";
import {
  AUTO_REPLY_COOLDOWN_MAX,
  AUTO_REPLY_MATCH_LABEL,
  AUTO_REPLY_MATCH_MODES,
  AUTO_REPLY_RESPONSE_MAX,
  AUTO_REPLY_TRIGGER_MAX,
  clampAutoReplyCooldown,
} from "@adobos/shared";
import {
  createAutoReply,
  deleteAutoReply,
  fetchAutoReplies,
  fetchGuildAssets,
  updateAutoReply,
} from "@/lib/api";
import { useEntitlements } from "@/features/entitlements/useEntitlements";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
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

type Draft = {
  trigger: string;
  matchMode: AutoReplyMatchMode;
  response: string;
  enabled: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  useReply: boolean;
  cooldownSeconds: number;
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
};

function emptyDraft(): Draft {
  return {
    trigger: "",
    matchMode: "contains",
    response: "",
    enabled: true,
    caseSensitive: false,
    wholeWord: false,
    useReply: true,
    cooldownSeconds: 0,
    allowedChannelIds: [],
    ignoredChannelIds: [],
  };
}

function toDraft(row: AutoReply): Draft {
  return {
    trigger: row.trigger,
    matchMode: row.matchMode,
    response: row.response,
    enabled: row.enabled,
    caseSensitive: row.caseSensitive,
    wholeWord: row.wholeWord,
    useReply: row.useReply,
    cooldownSeconds: row.cooldownSeconds,
    allowedChannelIds: [...row.allowedChannelIds],
    ignoredChannelIds: [...row.ignoredChannelIds],
  };
}

export function AutoRepliesDashboard() {
  const { limitOf, isUnlimited } = useEntitlements();
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [creating, setCreating] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cap = limitOf("autoReplies");
  const atLimit = !isUnlimited("autoReplies") && replies.length >= cap;

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => ch.type === 0 || ch.type === 5 || ch.type === 15)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, assets] = await Promise.all([
        fetchAutoReplies(),
        fetchGuildAssets(),
      ]);
      setReplies(config.replies);
      setDrafts(
        Object.fromEntries(config.replies.map((row) => [row.id, toDraft(row)])),
      );
      setChannels(assets.channels);
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
      trigger: draft.trigger,
      matchMode: draft.matchMode,
      response: draft.response,
      enabled: draft.enabled,
      caseSensitive: draft.caseSensitive,
      wholeWord: draft.wholeWord,
      useReply: draft.useReply,
      cooldownSeconds: draft.cooldownSeconds,
      allowedChannelIds: draft.allowedChannelIds,
      ignoredChannelIds: draft.ignoredChannelIds,
    };
  }

  async function onCreate(): Promise<void> {
    if (!creating) return;
    if (!creating.trigger.trim() || !creating.response.trim()) {
      setError("Escribe un trigger y una respuesta.");
      return;
    }
    setSavingId("new");
    setError(null);
    setSuccess(null);
    try {
      await createAutoReply(payload(creating));
      setCreating(null);
      setSuccess("Auto-Reply creada.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setSavingId(null);
    }
  }

  async function onSave(id: number): Promise<void> {
    const draft = drafts[id];
    if (!draft?.trigger.trim() || !draft.response.trim()) {
      setError("Escribe un trigger y una respuesta.");
      return;
    }
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await updateAutoReply(id, payload(draft));
      setSuccess("Auto-Reply guardada.");
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
      await deleteAutoReply(id);
      setSuccess("Auto-Reply borrada.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setSavingId(null);
    }
  }

  function openCreate(): void {
    if (atLimit) {
      setError(`Has alcanzado el límite de ${cap} Auto-Replies de este plan.`);
      return;
    }
    setCreating(emptyDraft());
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando Auto-Replies…
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
          <CardTitle>Auto-Replies</CardTitle>
          <CardDescription>
            Si un mensaje coincide con el trigger, el bot responde. No es
            Custom Commands (eso es slash) ni Auto-Mod (eso filtra). Tokens:{" "}
            {"{user}"} {"{username}"} {"{server}"} {"{channel}"}.{" "}
            {isUnlimited("autoReplies")
              ? `${replies.length} reglas.`
              : `${replies.length} / ${cap} reglas.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            disabled={atLimit || creating !== null}
          >
            <Plus className="size-4" aria-hidden />
            Nueva regla
          </Button>
        </CardContent>
      </Card>

      {creating ? (
        <ReplyForm
          draft={creating}
          channels={textChannels}
          saving={savingId === "new"}
          onChange={setCreating}
          onSave={() => void onCreate()}
          onCancel={() => setCreating(null)}
          submitLabel="Crear"
        />
      ) : null}

      {replies.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay reglas. Ejemplo: trigger <code>hola</code>, respuesta{" "}
          <code>¡Hola {"{user}"}!</code>.
        </p>
      ) : (
        replies.map((row) => {
          const draft = drafts[row.id] ?? toDraft(row);
          return (
            <ReplyForm
              key={row.id}
              draft={draft}
              channels={textChannels}
              saving={savingId === row.id}
              onChange={(next) =>
                setDrafts((prev) => ({ ...prev, [row.id]: next }))
              }
              onSave={() => void onSave(row.id)}
              onDelete={() => void onDelete(row.id)}
              submitLabel="Guardar"
            />
          );
        })
      )}
    </div>
  );
}

function ReplyForm({
  draft,
  channels,
  saving,
  onChange,
  onSave,
  onCancel,
  onDelete,
  submitLabel,
}: {
  draft: Draft;
  channels: GuildChannelAsset[];
  saving: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const enabledId = useId();
  const caseId = useId();
  const wordId = useId();
  const replyId = useId();
  const channelOptions = channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    type: ch.type,
    parentId: ch.parentId,
  }));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Input
              value={draft.trigger}
              maxLength={AUTO_REPLY_TRIGGER_MAX}
              disabled={saving}
              placeholder="hola"
              onChange={(event) =>
                onChange({ ...draft, trigger: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Coincidencia</Label>
            <Select
              value={draft.matchMode}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  matchMode: value as AutoReplyMatchMode,
                })
              }
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_REPLY_MATCH_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {AUTO_REPLY_MATCH_LABEL[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Respuesta</Label>
          <Textarea
            value={draft.response}
            maxLength={AUTO_REPLY_RESPONSE_MAX}
            disabled={saving}
            placeholder="¡Hola {user}!"
            onChange={(event) =>
              onChange({ ...draft, response: event.target.value })
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cooldown (s)</Label>
            <Input
              type="number"
              min={0}
              max={AUTO_REPLY_COOLDOWN_MAX}
              value={draft.cooldownSeconds}
              disabled={saving}
              onChange={(event) =>
                onChange({
                  ...draft,
                  cooldownSeconds: clampAutoReplyCooldown(event.target.value),
                })
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id={enabledId}
              checked={draft.enabled}
              onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
              disabled={saving}
            />
            <Label htmlFor={enabledId}>Activa</Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id={replyId}
              checked={draft.useReply}
              onCheckedChange={(useReply) => onChange({ ...draft, useReply })}
              disabled={saving}
            />
            <Label htmlFor={replyId}>Responder al mensaje (reply)</Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id={caseId}
              checked={draft.caseSensitive}
              onCheckedChange={(caseSensitive) =>
                onChange({ ...draft, caseSensitive })
              }
              disabled={saving}
            />
            <Label htmlFor={caseId}>Distinguir mayúsculas</Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id={wordId}
              checked={draft.wholeWord}
              onCheckedChange={(wholeWord) => onChange({ ...draft, wholeWord })}
              disabled={saving}
            />
            <Label htmlFor={wordId}>Palabra completa (hola ≠ holanda)</Label>
          </div>
        </div>

        <ChannelMultiSelect
          label="Solo en estos canales (vacío = todos)"
          channels={channelOptions}
          value={draft.allowedChannelIds}
          onChange={(allowedChannelIds) =>
            onChange({ ...draft, allowedChannelIds })
          }
          disabled={saving}
          emptyHint="Todos los canales de texto."
        />
        <ChannelMultiSelect
          label="Ignorar canales"
          channels={channelOptions}
          value={draft.ignoredChannelIds}
          onChange={(ignoredChannelIds) =>
            onChange({ ...draft, ignoredChannelIds })
          }
          disabled={saving}
        />

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
