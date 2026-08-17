import type {
  EmbedTemplateSummary,
  FormQuestion,
  FormQuestionStyle,
  FormResponse,
  GuildChannelAsset,
  InteractiveForm,
} from "@adobos/shared";
import {
  FORMS_MAX_QUESTIONS,
  defaultFormQuestion,
  defaultInteractiveForm,
  embedPayloadToScheduledEmbedData,
} from "@adobos/shared";
import {
  createForm,
  deleteForm,
  fetchEmbedTemplate,
  fetchFormResponses,
  fetchForms,
  fetchGuildAssets,
  listEmbedTemplates,
  publishForm,
  resolvePublicAssetUrl,
  saveForm,
} from "@/lib/api";
import {
  HybridImageInput,
  type HybridImageValue,
} from "@/components/shared/HybridImageInput";
import { UserAvatar } from "@/components/shared/UserAvatar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type MainTab = "list" | "builder";
type BuilderTab = "message" | "questions" | "reception";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);

const STYLE_LABELS: Record<FormQuestionStyle, string> = {
  SHORT: "Texto corto",
  PARAGRAPH: "Párrafo",
};

function mediaToStored(value: HybridImageValue): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function formFingerprint(form: InteractiveForm): string {
  return JSON.stringify({
    modalTitle: form.modalTitle,
    buttonLabel: form.buttonLabel,
    embedTitle: form.embedTitle,
    embedDescription: form.embedDescription,
    embedColor: form.embedColor,
    embedImageUrl: form.embedImageUrl,
    embedThumbnailUrl: form.embedThumbnailUrl,
    publishChannelId: form.publishChannelId,
    receptionChannelId: form.receptionChannelId,
    cooldownMinutes: form.cooldownMinutes,
    questions: form.questions,
  });
}

function FormsEmbedPreview({
  form,
  imagePreview,
  thumbPreview,
}: {
  form: InteractiveForm;
  imagePreview: string | null;
  thumbPreview: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1] shadow-sm">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: form.embedColor || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold text-white">
                {form.embedTitle || "Sin título"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
                {form.embedDescription || "Sin descripción"}
              </p>
            </div>
            {thumbPreview ? (
              <img
                src={thumbPreview}
                alt=""
                className="size-16 shrink-0 rounded object-cover"
              />
            ) : null}
          </div>
          {imagePreview ? (
            <img
              src={imagePreview}
              alt=""
              className="max-h-40 w-full rounded object-cover"
            />
          ) : null}
          <button
            type="button"
            className="mt-1 rounded bg-[#5865f2] px-3 py-1.5 text-xs font-medium text-white"
          >
            {form.buttonLabel || "Abrir formulario"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormsModalPreview({ form }: { form: InteractiveForm }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#1e1f22] bg-[#313338] shadow-xl">
      <div className="border-b border-black/20 px-4 py-3">
        <p className="text-sm font-semibold text-white">
          {form.modalTitle || "Formulario"}
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        {form.questions.length === 0 ? (
          <p className="text-xs text-[#b5bac1]">
            Añade preguntas para ver el modal.
          </p>
        ) : (
          form.questions.map((q) => (
            <div key={q.id} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                {q.label}
                {q.required ? (
                  <span className="text-[#f23f43]"> *</span>
                ) : null}
              </p>
              <div
                className={cn(
                  "rounded border border-transparent bg-[#1e1f22] px-2 py-2 text-xs text-[#949ba4]",
                  q.style === "PARAGRAPH" ? "min-h-[72px]" : "min-h-[36px]",
                )}
              >
                {q.placeholder?.trim()
                  ? q.placeholder
                  : q.style === "PARAGRAPH"
                    ? "Respuesta larga…"
                    : "Respuesta…"}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-black/20 px-4 py-3">
        <span className="rounded px-3 py-1.5 text-xs text-[#b5bac1]">
          Cancelar
        </span>
        <span className="rounded bg-[#5865f2] px-3 py-1.5 text-xs font-medium text-white">
          Enviar
        </span>
      </div>
    </div>
  );
}

export function FormsDashboard() {
  const [mainTab, setMainTab] = useState<MainTab>("list");
  const [forms, setForms] = useState<InteractiveForm[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<InteractiveForm>(() =>
    defaultInteractiveForm(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    formFingerprint(defaultInteractiveForm()),
  );
  const [imageValue, setImageValue] = useState<HybridImageValue>(null);
  const [thumbValue, setThumbValue] = useState<HybridImageValue>(null);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [templates, setTemplates] = useState<EmbedTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState("none");
  const [builderTab, setBuilderTab] = useState<BuilderTab>("message");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [responsesOpen, setResponsesOpen] = useState(false);
  const [responsesForm, setResponsesForm] = useState<InteractiveForm | null>(
    null,
  );
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<number | null>(
    null,
  );

  const dirty = useMemo(
    () => formFingerprint(draft) !== savedFingerprint,
    [draft, savedFingerprint],
  );

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const channelName = useCallback(
    (channelId: string | null) => {
      if (!channelId) return "Sin canal";
      return (
        textChannels.find((ch) => ch.id === channelId)?.name ?? channelId
      );
    },
    [textChannels],
  );

  const imagePreview = useMemo(() => {
    const raw =
      (typeof imageValue === "string" && imageValue.trim()) ||
      draft.embedImageUrl ||
      "";
    return raw ? resolvePublicAssetUrl(raw) : null;
  }, [imageValue, draft.embedImageUrl]);

  const thumbPreview = useMemo(() => {
    const raw =
      (typeof thumbValue === "string" && thumbValue.trim()) ||
      draft.embedThumbnailUrl ||
      "";
    return raw ? resolvePublicAssetUrl(raw) : null;
  }, [thumbValue, draft.embedThumbnailUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, assets, templatesRes] = await Promise.all([
        fetchForms(),
        fetchGuildAssets(),
        listEmbedTemplates().catch(() => ({ templates: [] })),
      ]);
      setForms(listRes.forms);
      setChannels(assets.channels);
      setTemplates(templatesRes.templates);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar Formularios.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFormToDraft = (form: InteractiveForm) => {
    setDraft(form);
    setSavedFingerprint(formFingerprint(form));
    setImageValue(form.embedImageUrl);
    setThumbValue(form.embedThumbnailUrl);
    setTemplateId("none");
  };

  const openCreate = async () => {
    setError(null);
    setSuccess(null);
    try {
      const res = await createForm({});
      applyFormToDraft(res.form);
      setEditingId(res.form.id);
      setBuilderTab("message");
      setMainTab("builder");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el formulario.",
      );
    }
  };

  const openEdit = (form: InteractiveForm) => {
    applyFormToDraft(form);
    setEditingId(form.id);
    setBuilderTab("message");
    setMainTab("builder");
    setSuccess(null);
  };

  const patch = (partial: Partial<InteractiveForm>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setSuccess(null);
  };

  const updateQuestion = (index: number, partial: Partial<FormQuestion>) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, ...partial } : q,
      ),
    }));
    setSuccess(null);
  };

  const removeQuestion = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
    setSuccess(null);
  };

  const addQuestion = () => {
    setDraft((prev) => {
      if (prev.questions.length >= FORMS_MAX_QUESTIONS) return prev;
      return {
        ...prev,
        questions: [...prev.questions, defaultFormQuestion()],
      };
    });
    setSuccess(null);
  };

  const loadTemplate = async (idValue: string) => {
    setTemplateId(idValue);
    if (idValue === "none") return;
    const id = Number.parseInt(idValue, 10);
    if (!Number.isFinite(id)) return;
    setError(null);
    try {
      const detail = await fetchEmbedTemplate(id);
      const mapped = embedPayloadToScheduledEmbedData(detail.embedData);
      const image = detail.embedData.imageUrl?.trim() || null;
      const thumb = detail.embedData.thumbnailUrl?.trim() || null;
      setDraft((prev) => ({
        ...prev,
        embedTitle: mapped.title,
        embedDescription: mapped.description,
        embedColor: mapped.color,
        embedImageUrl: image,
        embedThumbnailUrl: thumb,
      }));
      setImageValue(image);
      setThumbValue(thumb);
      setSuccess(`Plantilla «${detail.name}» cargada.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la plantilla.",
      );
      setTemplateId("none");
    }
  };

  const payload = (): UpdateFormPayload => ({
    modalTitle: draft.modalTitle,
    buttonLabel: draft.buttonLabel,
    embedTitle: draft.embedTitle,
    embedDescription: draft.embedDescription,
    embedColor: draft.embedColor,
    embedImageUrl: mediaToStored(imageValue) ?? draft.embedImageUrl,
    embedThumbnailUrl: mediaToStored(thumbValue) ?? draft.embedThumbnailUrl,
    publishChannelId: draft.publishChannelId,
    receptionChannelId: draft.receptionChannelId,
    questions: draft.questions,
    cooldownMinutes: draft.cooldownMinutes,
  });

  type UpdateFormPayload = Parameters<typeof saveForm>[1];

  const save = async () => {
    if (editingId == null) {
      setError("No hay formulario en edición.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveForm(editingId, payload());
      applyFormToDraft(res.form);
      setSuccess("Formulario guardado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (editingId == null) {
      setError("No hay formulario en edición.");
      return;
    }
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await publishForm(editingId, payload());
      applyFormToDraft(res.form);
      setSuccess("Formulario publicado en Discord.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar.");
    } finally {
      setPublishing(false);
    }
  };

  const onDelete = async (form: InteractiveForm) => {
    if (
      !window.confirm(
        `¿Eliminar «${form.embedTitle}»? Se borrarán sus respuestas y el mensaje publicado (si existe).`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteForm(form.id);
      if (editingId === form.id) {
        setEditingId(null);
        setDraft(defaultInteractiveForm());
        setMainTab("list");
      }
      setSuccess("Formulario eliminado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  };

  const openResponses = async (form: InteractiveForm) => {
    setResponsesForm(form);
    setResponsesOpen(true);
    setExpandedResponseId(null);
    setLoadingResponses(true);
    setError(null);
    try {
      const res = await fetchFormResponses(form.id);
      setResponses(res.responses);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las respuestas.",
      );
      setResponses([]);
    } finally {
      setLoadingResponses(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Cargando Formularios…
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

      <Tabs>
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2 gap-1">
          <TabsTrigger
            type="button"
            active={mainTab === "list"}
            onClick={() => setMainTab("list")}
          >
            Mis Formularios
          </TabsTrigger>
          <TabsTrigger
            type="button"
            active={mainTab === "builder"}
            onClick={() => {
              if (mainTab !== "builder") {
                if (editingId != null) setMainTab("builder");
                else void openCreate();
              }
            }}
          >
            {editingId != null ? "Crear/Editar" : "Crear/Editar"}
          </TabsTrigger>
        </TabsList>

        {mainTab === "list" ? (
          <TabsContent className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {forms.length === 0
                  ? "Aún no hay formularios."
                  : `${forms.length} formulario${forms.length === 1 ? "" : "s"}`}
              </p>
              <Button type="button" size="sm" onClick={() => void openCreate()}>
                <Plus className="size-4" aria-hidden />
                Nuevo
              </Button>
            </div>

            {forms.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
                <ClipboardList
                  className="size-8 text-primary/70"
                  aria-hidden
                />
                <p className="text-sm font-medium">No hay formularios</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Crea un formulario interactivo con modal de Discord y canal
                  de recepción.
                </p>
                <Button type="button" onClick={() => void openCreate()}>
                  Crear formulario
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {forms.map((form) => (
                  <li key={form.id}>
                    <Card>
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">
                              {form.embedTitle || form.modalTitle}
                            </p>
                            <Badge>
                              {form.responseCount} resp.
                            </Badge>
                            {form.publishedMessageId ? (
                              <Badge className="border-primary/40 bg-primary/15 text-primary">
                                Publicado
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Recepción: #{channelName(form.receptionChannelId)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {form.questions.length}/{FORMS_MAX_QUESTIONS}{" "}
                            preguntas
                            {form.cooldownMinutes > 0
                              ? ` · Cooldown ${form.cooldownMinutes} min`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void openResponses(form)}
                          >
                            <Eye className="size-3.5" aria-hidden />
                            Ver Respuestas
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(form)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void onDelete(form)}
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
          <TabsContent className="mt-4">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="min-w-0 space-y-4 lg:col-span-2">
                <Tabs>
                  <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
                    <TabsTrigger
                      type="button"
                      active={builderTab === "message"}
                      onClick={() => setBuilderTab("message")}
                    >
                      1. Mensaje Base
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "questions"}
                      onClick={() => setBuilderTab("questions")}
                    >
                      2. Preguntas (Modal)
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "reception"}
                      onClick={() => setBuilderTab("reception")}
                    >
                      3. Recepción
                    </TabsTrigger>
                  </TabsList>

                  {builderTab === "message" ? (
                    <TabsContent className="mt-4 space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Embed de invitación
                          </CardTitle>
                          <CardDescription>
                            Mensaje con botón que abre el modal.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label>
                              Cargar desde Plantilla de Embed (Opcional)
                            </Label>
                            <Select
                              value={templateId}
                              onValueChange={(v) => void loadTemplate(v)}
                              disabled={templates.length === 0}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    templates.length === 0
                                      ? "No hay plantillas"
                                      : "Selecciona una plantilla"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  Sin plantilla
                                </SelectItem>
                                {templates.map((tpl) => (
                                  <SelectItem
                                    key={tpl.id}
                                    value={String(tpl.id)}
                                  >
                                    {tpl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Canal de publicación</Label>
                            <Select
                              value={draft.publishChannelId || undefined}
                              onValueChange={(value) =>
                                patch({ publishChannelId: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar canal" />
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

                          <div className="space-y-1.5">
                            <Label>Título del embed</Label>
                            <Input
                              value={draft.embedTitle}
                              maxLength={256}
                              onChange={(e) =>
                                patch({ embedTitle: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Descripción</Label>
                            <Textarea
                              rows={4}
                              value={draft.embedDescription}
                              maxLength={4000}
                              onChange={(e) =>
                                patch({ embedDescription: e.target.value })
                              }
                            />
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <HybridImageInput
                              id="forms-image"
                              label="Imagen principal"
                              value={imageValue}
                              uploadImmediately
                              onChange={(next) => {
                                setImageValue(next);
                                if (typeof next === "string" || next === null) {
                                  patch({ embedImageUrl: next });
                                }
                                setSuccess(null);
                              }}
                            />
                            <HybridImageInput
                              id="forms-thumb"
                              label="Thumbnail"
                              value={thumbValue}
                              uploadImmediately
                              onChange={(next) => {
                                setThumbValue(next);
                                if (typeof next === "string" || next === null) {
                                  patch({ embedThumbnailUrl: next });
                                }
                                setSuccess(null);
                              }}
                            />
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Color</Label>
                              <div className="flex gap-2">
                                <Input
                                  type="color"
                                  className="h-10 w-14 cursor-pointer p-1"
                                  value={draft.embedColor || "#5865F2"}
                                  onChange={(e) =>
                                    patch({ embedColor: e.target.value })
                                  }
                                />
                                <Input
                                  value={draft.embedColor}
                                  onChange={(e) =>
                                    patch({ embedColor: e.target.value })
                                  }
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Texto del botón</Label>
                              <Input
                                value={draft.buttonLabel}
                                maxLength={80}
                                onChange={(e) =>
                                  patch({ buttonLabel: e.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Título del modal</Label>
                            <Input
                              value={draft.modalTitle}
                              maxLength={45}
                              onChange={(e) =>
                                patch({ modalTitle: e.target.value })
                              }
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Máximo 45 caracteres (límite de Discord).
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}

                  {builderTab === "questions" ? (
                    <TabsContent className="mt-4 space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Discord permite máximo {FORMS_MAX_QUESTIONS} campos de
                        texto por modal.
                      </p>
                      {draft.questions.map((question, index) => (
                        <Card key={question.id}>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium">
                                {question.label || `Pregunta ${index + 1}`}
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive"
                                onClick={() => removeQuestion(index)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Título de la pregunta</Label>
                              <Input
                                value={question.label}
                                maxLength={45}
                                onChange={(e) =>
                                  updateQuestion(index, {
                                    label: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Placeholder</Label>
                              <Input
                                value={question.placeholder}
                                maxLength={100}
                                placeholder="Texto de ayuda dentro del campo…"
                                onChange={(e) =>
                                  updateQuestion(index, {
                                    placeholder: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label>Tipo</Label>
                                <Select
                                  value={question.style}
                                  onValueChange={(value) =>
                                    updateQuestion(index, {
                                      style: value as FormQuestionStyle,
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(
                                      Object.keys(
                                        STYLE_LABELS,
                                      ) as FormQuestionStyle[]
                                    ).map((style) => (
                                      <SelectItem key={style} value={style}>
                                        {STYLE_LABELS[style]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                                <Label className="text-sm">
                                  Campo obligatorio
                                </Label>
                                <Switch
                                  checked={question.required}
                                  onCheckedChange={(checked) =>
                                    updateQuestion(index, {
                                      required: checked,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          draft.questions.length >= FORMS_MAX_QUESTIONS
                        }
                        onClick={addQuestion}
                      >
                        <Plus className="size-4" aria-hidden />
                        Añadir pregunta
                        <Badge className="ml-1">
                          {draft.questions.length}/{FORMS_MAX_QUESTIONS}
                        </Badge>
                      </Button>
                    </TabsContent>
                  ) : null}

                  {builderTab === "reception" ? (
                    <TabsContent className="mt-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Canal de recepción
                          </CardTitle>
                          <CardDescription>
                            Aquí el bot enviará un embed con cada respuesta
                            completada.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label>Canal de logs</Label>
                            <Select
                              value={draft.receptionChannelId || undefined}
                              onValueChange={(value) =>
                                patch({ receptionChannelId: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar canal" />
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
                          <div className="space-y-1.5">
                            <Label>Cooldown (Minutos)</Label>
                            <Input
                              type="number"
                              min={0}
                              max={43200}
                              value={draft.cooldownMinutes}
                              onChange={(e) =>
                                patch({
                                  cooldownMinutes: Math.max(
                                    0,
                                    Number.parseInt(e.target.value, 10) || 0,
                                  ),
                                })
                              }
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Tiempo que debe esperar un usuario antes de volver
                              a enviar este formulario. 0 = sin límite.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}
                </Tabs>
              </div>

              <Card className="sticky top-4 self-start">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Vista previa</CardTitle>
                  <CardDescription>
                    {builderTab === "questions"
                      ? "Modal de Discord"
                      : "Mensaje de invitación"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {builderTab === "questions" ? (
                    <FormsModalPreview form={draft} />
                  ) : (
                    <FormsEmbedPreview
                      form={draft}
                      imagePreview={imagePreview}
                      thumbPreview={thumbPreview}
                    />
                  )}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      Preguntas:{" "}
                      <span className="font-mono text-foreground">
                        {draft.questions.length}/{FORMS_MAX_QUESTIONS}
                      </span>
                    </p>
                    <p>
                      Publicado:{" "}
                      <span className="font-mono text-foreground">
                        {draft.publishedMessageId ? "Sí" : "No"}
                      </span>
                    </p>
                    {dirty ? (
                      <p className="text-amber-500">Cambios sin guardar</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void save()}
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Save className="size-4" aria-hidden />
                      )}
                      Guardar
                    </Button>
                    <Button
                      type="button"
                      disabled={publishing}
                      onClick={() => void publish()}
                    >
                      {publishing ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="size-4" aria-hidden />
                      )}
                      Publicar en Discord
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog
        open={responsesOpen}
        onOpenChange={setResponsesOpen}
        title={
          responsesForm
            ? `Respuestas · ${responsesForm.embedTitle || responsesForm.modalTitle}`
            : "Respuestas"
        }
        description={`${responses.length} envío${responses.length === 1 ? "" : "s"}`}
        className="max-w-3xl"
      >
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loadingResponses ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando…
            </div>
          ) : responses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay respuestas para este formulario.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Usuario
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fecha
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Detalle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((row) => {
                    const open = expandedResponseId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-border/60">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                src={row.avatarUrl}
                                name={row.displayName || row.username}
                                className="size-7"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {row.displayName || row.username}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  @{row.username}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setExpandedResponseId(open ? null : row.id)
                              }
                            >
                              {open ? "Ocultar" : "Ver"}
                            </Button>
                          </td>
                        </tr>
                        {open ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="bg-muted/20 px-3 py-3"
                            >
                              <dl className="space-y-2">
                                {row.answers.map((answer) => (
                                  <div key={answer.questionId}>
                                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {answer.label}
                                    </dt>
                                    <dd className="whitespace-pre-wrap text-sm">
                                      {answer.value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
