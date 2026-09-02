import type {
  GuildChannelAsset,
  VoiceRoomAction,
  VoiceRoomActionMap,
  VoiceRoomGenerator,
} from "@adobos/shared";
import {
  VOICE_ROOM_ACTION_LABELS,
  VOICE_ROOM_ACTIONS,
  VOICE_ROOM_DEFAULT_TEMPLATE,
  VOICE_ROOM_GENERATORS_MAX,
  defaultVoiceRoomActions,
  isVoiceCategoryChannelType,
  isVoiceHubChannelType,
} from "@adobos/shared";
import {
  createVoiceRoomGenerator,
  deleteVoiceRoomGenerator,
  fetchGuildAssets,
  fetchVoiceRooms,
  updateVoiceRoomGenerator,
} from "@/lib/api";
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
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const NONE = "__none__";

type Draft = {
  hubChannelId: string;
  categoryId: string;
  nameTemplate: string;
  defaultUserLimit: number;
  defaultBitrate: number;
  autoText: boolean;
  enabled: boolean;
  allowedActions: VoiceRoomActionMap;
};

function toDraft(g: VoiceRoomGenerator): Draft {
  return {
    hubChannelId: g.hubChannelId,
    categoryId: g.categoryId ?? "",
    nameTemplate: g.nameTemplate,
    defaultUserLimit: g.defaultUserLimit,
    defaultBitrate: g.defaultBitrate,
    autoText: g.autoText,
    enabled: g.enabled,
    allowedActions: { ...g.allowedActions },
  };
}

function emptyDraft(): Draft {
  return {
    hubChannelId: "",
    categoryId: "",
    nameTemplate: VOICE_ROOM_DEFAULT_TEMPLATE,
    defaultUserLimit: 0,
    defaultBitrate: 0,
    autoText: false,
    enabled: true,
    allowedActions: defaultVoiceRoomActions(),
  };
}

export function VoiceRoomsDashboard() {
  const [generators, setGenerators] = useState<VoiceRoomGenerator[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [creating, setCreating] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const voiceChannels = useMemo(
    () =>
      channels
        .filter((ch) => isVoiceHubChannelType(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );
  const categories = useMemo(
    () =>
      channels
        .filter((ch) => isVoiceCategoryChannelType(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, assets] = await Promise.all([
        fetchVoiceRooms(),
        fetchGuildAssets(),
      ]);
      setGenerators(config.generators);
      setLiveCount(config.rooms.length);
      setDrafts(
        Object.fromEntries(config.generators.map((g) => [g.id, toDraft(g)])),
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

  function patchDraft(id: number, patch: Partial<Draft>): void {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyDraft()), ...patch },
    }));
  }

  function toggleAction(
    target: Draft,
    set: (next: Draft) => void,
    action: VoiceRoomAction,
  ): void {
    set({
      ...target,
      allowedActions: {
        ...target.allowedActions,
        [action]: !target.allowedActions[action],
      },
    });
  }

  async function onCreate(): Promise<void> {
    if (!creating?.hubChannelId) {
      setError("Elige un canal hub de voz.");
      return;
    }
    setSavingId("new");
    setError(null);
    setSuccess(null);
    try {
      await createVoiceRoomGenerator({
        hubChannelId: creating.hubChannelId,
        categoryId: creating.categoryId || null,
        nameTemplate: creating.nameTemplate,
        defaultUserLimit: creating.defaultUserLimit,
        defaultBitrate: creating.defaultBitrate,
        autoText: creating.autoText,
        enabled: creating.enabled,
        allowedActions: creating.allowedActions,
      });
      setCreating(null);
      setSuccess("Generador creado.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setSavingId(null);
    }
  }

  async function onSave(id: number): Promise<void> {
    const draft = drafts[id];
    if (!draft?.hubChannelId) {
      setError("Elige un canal hub de voz.");
      return;
    }
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      await updateVoiceRoomGenerator(id, {
        hubChannelId: draft.hubChannelId,
        categoryId: draft.categoryId || null,
        nameTemplate: draft.nameTemplate,
        defaultUserLimit: draft.defaultUserLimit,
        defaultBitrate: draft.defaultBitrate,
        autoText: draft.autoText,
        enabled: draft.enabled,
        allowedActions: draft.allowedActions,
      });
      setSuccess("Generador guardado.");
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
      await deleteVoiceRoomGenerator(id);
      setSuccess("Generador eliminado. Las salas vivas de ese hub se borran.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando Voice Rooms…
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
          <CardTitle>Join to Create</CardTitle>
          <CardDescription>
            El miembro entra al hub, el bot crea una sala y lo mueve. Vacía
            (~5 s) = se borra. El dueño usa <code>/voice</code>. El hub nunca
            se elimina. Salas vivas ahora: {liveCount}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={
              Boolean(creating) ||
              generators.length >= VOICE_ROOM_GENERATORS_MAX
            }
            onClick={() => setCreating(emptyDraft())}
          >
            <Plus className="size-4" />
            Añadir generador
          </Button>
        </CardContent>
      </Card>

      {creating ? (
        <GeneratorForm
          title="Nuevo generador"
          draft={creating}
          voiceChannels={voiceChannels}
          categories={categories}
          saving={savingId === "new"}
          onChange={setCreating}
          onToggleAction={(action) =>
            toggleAction(creating, setCreating, action)
          }
          onSave={() => void onCreate()}
          onCancel={() => setCreating(null)}
        />
      ) : null}

      {generators.map((g) => {
        const draft = drafts[g.id] ?? toDraft(g);
        return (
          <GeneratorForm
            key={g.id}
            title={`Hub #${g.id}`}
            draft={draft}
            voiceChannels={voiceChannels}
            categories={categories}
            saving={savingId === g.id}
            onChange={(next) => patchDraft(g.id, next)}
            onToggleAction={(action) =>
              toggleAction(draft, (next) => patchDraft(g.id, next), action)
            }
            onSave={() => void onSave(g.id)}
            onDelete={() => void onDelete(g.id)}
          />
        );
      })}
    </div>
  );
}

function GeneratorForm(props: {
  title: string;
  draft: Draft;
  voiceChannels: GuildChannelAsset[];
  categories: GuildChannelAsset[];
  saving: boolean;
  onChange: (draft: Draft) => void;
  onToggleAction: (action: VoiceRoomAction) => void;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { draft } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Canal hub (voz)</Label>
            <Select
              value={draft.hubChannelId || NONE}
              onValueChange={(value) =>
                props.onChange({
                  ...draft,
                  hubChannelId: value === NONE ? "" : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un canal de voz" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecciona…</SelectItem>
                {props.voiceChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Categoría de las salas</Label>
            <Select
              value={draft.categoryId || NONE}
              onValueChange={(value) =>
                props.onChange({
                  ...draft,
                  categoryId: value === NONE ? "" : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Misma que el hub" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Misma que el hub</SelectItem>
                {props.categories.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`tpl-${props.title}`}>Plantilla de nombre</Label>
          <Input
            id={`tpl-${props.title}`}
            value={draft.nameTemplate}
            maxLength={100}
            onChange={(event) =>
              props.onChange({ ...draft, nameTemplate: event.target.value })
            }
            placeholder="{user}'s room"
          />
          <p className="text-xs text-muted-foreground">
            {"{user}"} = nombre visible. El hub no se borra nunca.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Límite default (0 = sin límite)</Label>
            <Input
              type="number"
              min={0}
              max={99}
              value={draft.defaultUserLimit}
              onChange={(event) =>
                props.onChange({
                  ...draft,
                  defaultUserLimit: Number(event.target.value) || 0,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Bitrate default kbps (0 = Discord)</Label>
            <Input
              type="number"
              min={0}
              max={384}
              value={draft.defaultBitrate}
              onChange={(event) =>
                props.onChange({
                  ...draft,
                  defaultBitrate: Number(event.target.value) || 0,
                })
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(enabled) =>
                props.onChange({ ...draft, enabled })
              }
            />
            Activo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.autoText}
              onCheckedChange={(autoText) =>
                props.onChange({ ...draft, autoText })
              }
            />
            Crear canal de texto al instante
          </label>
        </div>

        <div className="space-y-2">
          <Label>Qué puede hacer el dueño</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {VOICE_ROOM_ACTIONS.map((action) => (
              <label
                key={action}
                className="flex items-center gap-2 text-sm"
              >
                <Switch
                  checked={draft.allowedActions[action]}
                  onCheckedChange={() => props.onToggleAction(action)}
                />
                {VOICE_ROOM_ACTION_LABELS[action]}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={props.saving} onClick={props.onSave}>
            {props.saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar
          </Button>
          {props.onCancel ? (
            <Button type="button" variant="outline" onClick={props.onCancel}>
              Cancelar
            </Button>
          ) : null}
          {props.onDelete ? (
            <Button
              type="button"
              variant="outline"
              disabled={props.saving}
              onClick={props.onDelete}
            >
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
