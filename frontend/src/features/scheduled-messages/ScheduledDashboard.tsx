import type {
  CreateScheduledMessageRequest,
  EmbedTemplateSummary,
  GuildChannelAsset,
  ScheduledEmbedData,
  ScheduledFrequency,
  ScheduledFrequencyType,
  ScheduledMessage,
  ScheduledWeekday,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import {
  defaultScheduledEmbedData,
  defaultScheduledFrequency,
  detectLocalTimezone,
  embedPayloadToScheduledEmbedData,
  formatScheduledFrequencySummary,
} from "@adobos/shared";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  fetchEmbedTemplate,
  fetchGuildAssets,
  fetchScheduledMessages,
  listEmbedTemplates,
  resolvePublicAssetUrl,
  toggleScheduledMessage,
  updateScheduledMessage,
} from "@/lib/api";
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
import { TimezoneCombobox } from "@/features/scheduled-messages/TimezoneCombobox";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type BuilderTab = "list" | "builder";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);

const FREQUENCY_LABELS: Record<ScheduledFrequencyType, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  specific_date: "Fecha específica",
};

const WEEKDAY_OPTIONS: { value: ScheduledWeekday; label: string }[] = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function emptyDraft(): {
  channelId: string;
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  isActive: boolean;
} {
  return {
    channelId: "",
    timezone: detectLocalTimezone(),
    frequency: defaultScheduledFrequency(),
    embedData: defaultScheduledEmbedData(),
    isActive: true,
  };
}

function ScheduledEmbedPreview({
  embed,
}: {
  embed: ScheduledEmbedData;
}) {
  const previewImage = embed.imageUrl
    ? resolvePublicAssetUrl(embed.imageUrl)
    : null;
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1] shadow-sm">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: embed.color || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <p className="text-sm font-semibold text-white">
            {embed.title || "Sin título"}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
            {embed.description || "Sin descripción"}
          </p>
          {previewImage ? (
            <img
              src={previewImage}
              alt=""
              className="mt-1 max-h-48 w-full rounded object-cover"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toggleWeekday(
  days: ScheduledWeekday[],
  day: ScheduledWeekday,
): ScheduledWeekday[] {
  const set = new Set(days);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort((a, b) => a - b) as ScheduledWeekday[];
}

export function ScheduledDashboard() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [templates, setTemplates] = useState<EmbedTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState<string>("none");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [tab, setTab] = useState<BuilderTab>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const channelName = useCallback(
    (channelId: string) =>
      textChannels.find((ch) => ch.id === channelId)?.name ?? channelId,
    [textChannels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, assets, templatesRes] = await Promise.all([
        fetchScheduledMessages(),
        fetchGuildAssets(),
        listEmbedTemplates().catch(() => ({ templates: [] })),
      ]);
      setMessages(listRes.messages);
      setChannels(assets.channels);
      setTemplates(templatesRes.templates);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar Mensajes programados.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setTemplateId("none");
    setDraft(emptyDraft());
    setTab("builder");
    setSuccess(null);
  };

  const openEdit = (message: ScheduledMessage) => {
    setEditingId(message.id);
    setTemplateId("none");
    setDraft({
      channelId: message.channelId,
      timezone: message.timezone || detectLocalTimezone(),
      frequency: { ...message.frequency, days: [...message.frequency.days] },
      embedData: { ...message.embedData },
      isActive: message.isActive,
    });
    setTab("builder");
    setSuccess(null);
  };

  const patchFrequency = (partial: Partial<ScheduledFrequency>) => {
    setDraft((prev) => ({
      ...prev,
      frequency: { ...prev.frequency, ...partial },
    }));
    setSuccess(null);
  };

  const patchEmbed = (partial: Partial<ScheduledEmbedData>) => {
    setDraft((prev) => ({
      ...prev,
      embedData: { ...prev.embedData, ...partial },
    }));
    setSuccess(null);
  };

  const loadTemplate = async (idValue: string) => {
    setTemplateId(idValue);
    if (idValue === "none") return;
    const id = Number.parseInt(idValue, 10);
    if (!Number.isFinite(id)) return;
    setLoadingTemplate(true);
    setError(null);
    try {
      const detail = await fetchEmbedTemplate(id);
      setDraft((prev) => ({
        ...prev,
        embedData: embedPayloadToScheduledEmbedData(detail.embedData),
      }));
      setSuccess(`Plantilla «${detail.name}» cargada. Puedes editarla libremente.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la plantilla.",
      );
      setTemplateId("none");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const save = async () => {
    if (!draft.channelId) {
      setError("Selecciona un canal de destino.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId == null) {
        const body: CreateScheduledMessageRequest = {
          channelId: draft.channelId,
          timezone: draft.timezone,
          frequency: draft.frequency,
          embedData: draft.embedData,
          isActive: draft.isActive,
        };
        await createScheduledMessage(body);
        setSuccess("Programación creada.");
      } else {
        const body: UpdateScheduledMessageRequest = {
          channelId: draft.channelId,
          timezone: draft.timezone,
          frequency: draft.frequency,
          embedData: draft.embedData,
          isActive: draft.isActive,
        };
        await updateScheduledMessage(editingId, body);
        setSuccess("Programación actualizada.");
      }
      await load();
      setTab("list");
      setEditingId(null);
      setTemplateId("none");
      setDraft(emptyDraft());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (message: ScheduledMessage, isActive: boolean) => {
    setTogglingId(message.id);
    setError(null);
    try {
      const res = await toggleScheduledMessage(message.id, isActive);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? res.message : m)),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cambiar el estado.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const onDelete = async (message: ScheduledMessage) => {
    if (
      !window.confirm(
        `¿Eliminar «${message.label}»? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteScheduledMessage(message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (editingId === message.id) {
        setEditingId(null);
        setDraft(emptyDraft());
      }
      setSuccess("Mensaje eliminado.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar.",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Cargando Mensajes programados…
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
              <TabsTrigger
                type="button"
                active={tab === "list"}
                onClick={() => setTab("list")}
              >
                Mis Mensajes
              </TabsTrigger>
              <TabsTrigger
                type="button"
                active={tab === "builder"}
                onClick={() => {
                  if (tab !== "builder") openCreate();
                  else setTab("builder");
                }}
              >
                {editingId != null ? "Editar" : "Crear/Editar"}
              </TabsTrigger>
            </TabsList>

            {tab === "list" ? (
              <TabsContent className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {messages.length === 0
                      ? "Aún no hay programaciones."
                      : `${messages.length} mensaje${messages.length === 1 ? "" : "s"}`}
                  </p>
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus className="size-4" aria-hidden />
                    Nuevo
                  </Button>
                </div>

                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
                    <CalendarClock
                      className="size-8 text-primary/70"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-foreground">
                      No hay mensajes programados
                    </p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Crea anuncios y recordatorios que el bot enviará
                      automáticamente según el horario.
                    </p>
                    <Button type="button" onClick={openCreate}>
                      Crear mensaje
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {messages.map((message) => (
                      <li key={message.id}>
                        <Card>
                          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-medium text-foreground">
                                  {message.label}
                                </p>
                                <Badge
                                  className={
                                    message.isActive
                                      ? "border-primary/40 bg-primary/15 text-primary"
                                      : undefined
                                  }
                                >
                                  {message.isActive ? "Activo" : "Pausado"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                #{channelName(message.channelId)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatScheduledFrequencySummary(
                                  message.frequency,
                                  message.timezone,
                                )}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={message.isActive}
                                  disabled={togglingId === message.id}
                                  onCheckedChange={(checked) =>
                                    void onToggle(message, checked)
                                  }
                                  aria-label={
                                    message.isActive
                                      ? "Desactivar mensaje"
                                      : "Activar mensaje"
                                  }
                                />
                                <span className="text-xs text-muted-foreground">
                                  {togglingId === message.id
                                    ? "…"
                                    : message.isActive
                                      ? "ON"
                                      : "OFF"}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(message)}
                              >
                                <Pencil className="size-3.5" aria-hidden />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void onDelete(message)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                                Eliminar
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            ) : (
              <TabsContent className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Destino y Horario
                    </CardTitle>
                    <CardDescription>
                      Canal y frecuencia de envío automático.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Canal</Label>
                      <Select
                        value={draft.channelId || undefined}
                        onValueChange={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            channelId: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un canal" />
                        </SelectTrigger>
                        <SelectContent>
                          {textChannels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              #{ch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Tipo de frecuencia</Label>
                        <Select
                          value={draft.frequency.type}
                          onValueChange={(value) =>
                            patchFrequency({
                              type: value as ScheduledFrequencyType,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.keys(
                                FREQUENCY_LABELS,
                              ) as ScheduledFrequencyType[]
                            ).map((type) => (
                              <SelectItem key={type} value={type}>
                                {FREQUENCY_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Hora</Label>
                        <Input
                          type="time"
                          step={60}
                          value={draft.frequency.time || "12:00"}
                          onChange={(e) =>
                            patchFrequency({
                              time: e.target.value || "12:00",
                            })
                          }
                        />
                      </div>
                    </div>

                    {draft.frequency.type === "weekly" ? (
                      <div className="space-y-1.5">
                        <Label>Días de la semana</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAY_OPTIONS.map((day) => {
                            const active = draft.frequency.days.includes(
                              day.value,
                            );
                            return (
                              <button
                                key={day.value}
                                type="button"
                                aria-pressed={active}
                                className={cn(
                                  "h-8 min-w-10 rounded-md border px-2 text-xs font-medium transition-colors",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() =>
                                  patchFrequency({
                                    days: toggleWeekday(
                                      draft.frequency.days,
                                      day.value,
                                    ),
                                  })
                                }
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {draft.frequency.days.length === 0
                            ? "Sin selección = todos los días."
                            : "Solo se enviará en los días marcados."}
                        </p>
                      </div>
                    ) : null}

                    {draft.frequency.type === "monthly" ? (
                      <div className="space-y-1.5">
                        <Label>Día del mes</Label>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={draft.frequency.dayOfMonth}
                          onChange={(e) =>
                            patchFrequency({
                              dayOfMonth: Math.max(
                                1,
                                Math.min(
                                  31,
                                  Number.parseInt(e.target.value, 10) || 1,
                                ),
                              ),
                            })
                          }
                        />
                      </div>
                    ) : null}

                    {draft.frequency.type === "specific_date" ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label>Fecha</Label>
                          <Input
                            type="date"
                            value={draft.frequency.date}
                            onChange={(e) =>
                              patchFrequency({
                                date: e.target.value || draft.frequency.date,
                              })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <div className="min-w-0">
                            <Label
                              htmlFor="scheduled-repeat-yearly"
                              className="text-sm font-medium"
                            >
                              Repetir anualmente
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              Si está activo, el mensaje se enviará cada año en
                              esta fecha. Si está apagado, se enviará una sola
                              vez y se desactivará.
                            </p>
                          </div>
                          <Switch
                            id="scheduled-repeat-yearly"
                            checked={draft.frequency.repeatYearly}
                            onCheckedChange={(checked) =>
                              patchFrequency({ repeatYearly: checked })
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    <TimezoneCombobox
                      value={draft.timezone}
                      onChange={(timezone) =>
                        setDraft((prev) => ({ ...prev, timezone }))
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      La hora se interpreta en la zona elegida para este mensaje
                      (por defecto, la de tu navegador).
                    </p>

                    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Activo al guardar</p>
                        <p className="text-xs text-muted-foreground">
                          Si está OFF, se guarda pausado (sin cron).
                        </p>
                      </div>
                      <Switch
                        checked={draft.isActive}
                        onCheckedChange={(checked) =>
                          setDraft((prev) => ({
                            ...prev,
                            isActive: checked,
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Contenido del Mensaje
                    </CardTitle>
                    <CardDescription>
                      Mini embed que se enviará al canal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Cargar desde plantilla (Opcional)</Label>
                      <Select
                        value={templateId}
                        onValueChange={(value) => void loadTemplate(value)}
                        disabled={loadingTemplate || templates.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              templates.length === 0
                                ? "No hay plantillas guardadas"
                                : "Selecciona una plantilla"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin plantilla</SelectItem>
                          {templates.map((tpl) => (
                            <SelectItem key={tpl.id} value={String(tpl.id)}>
                              {tpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {loadingTemplate
                          ? "Cargando plantilla…"
                          : "Rellena color, título, descripción e imagen; luego puedes editarlos."}
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                      <div className="space-y-1.5">
                        <Label>Color</Label>
                        <Input
                          type="color"
                          className="h-10 w-14 cursor-pointer p-1"
                          value={draft.embedData.color || "#5865F2"}
                          onChange={(e) =>
                            patchEmbed({ color: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Título</Label>
                        <Input
                          value={draft.embedData.title}
                          maxLength={256}
                          onChange={(e) =>
                            patchEmbed({ title: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Descripción</Label>
                      <Textarea
                        rows={5}
                        value={draft.embedData.description}
                        maxLength={4000}
                        onChange={(e) =>
                          patchEmbed({ description: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Imagen URL (opcional)</Label>
                      <Input
                        type="url"
                        placeholder="https://…"
                        value={draft.embedData.imageUrl ?? ""}
                        onChange={(e) =>
                          patchEmbed({
                            imageUrl: e.target.value.trim() || null,
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    Guardar Programación
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTab("list");
                      setEditingId(null);
                      setTemplateId("none");
                      setDraft(emptyDraft());
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <Card className="sticky top-4 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vista previa</CardTitle>
            <CardDescription>
              Embed en tiempo real
              {tab === "list" && messages[0]
                ? " (último mensaje de la lista)"
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduledEmbedPreview
              embed={
                tab === "builder"
                  ? draft.embedData
                  : (messages[0]?.embedData ?? defaultScheduledEmbedData())
              }
            />
            {tab === "builder" ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {formatScheduledFrequencySummary(
                  draft.frequency,
                  draft.timezone,
                )}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
