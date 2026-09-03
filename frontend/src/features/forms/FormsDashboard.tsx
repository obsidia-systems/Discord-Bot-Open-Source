import type {
  EmbedTemplateSummary,
  FormQuestion,
  FormQuestionStyle,
  FormResponse,
  GuildChannelAsset,
  GuildRoleAsset,
  InteractiveForm,
} from "@adobos/shared";
import {
  FORMS_MAX_PER_GUILD,
  FORMS_MAX_QUESTIONS,
  defaultFormQuestion,
  defaultInteractiveForm,
  embedPayloadToScheduledEmbedData,
} from "@adobos/shared";
import {
  createForm,
  deleteForm,
  downloadFormResponsesCsv,
  fetchEmbedTemplate,
  fetchFormResponses,
  fetchForms,
  fetchGuildAssets,
  listEmbedTemplates,
  publishForm,
  resolvePublicAssetUrl,
  saveForm,
} from "@/lib/api";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
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
  Download,
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

const TEXT_CHANNEL_TYPES = new Set([0, 5]);

const STYLE_LABELS: Record<FormQuestionStyle, string> = {
  SHORT: "Short text",
  PARAGRAPH: "Paragraph",
  STRING_SELECT: "Dropdown",
  FILE_UPLOAD: "File",
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
    submitMode: form.submitMode,
    enabled: form.enabled,
    requiredRoleIds: form.requiredRoleIds,
    blockedRoleIds: form.blockedRoleIds,
    pingRoleId: form.pingRoleId,
    thankYouMessage: form.thankYouMessage,
    acceptRoleId: form.acceptRoleId,
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
                {form.embedTitle || "Untitled"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
                {form.embedDescription || "No description"}
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
            {form.buttonLabel || "Open form"}
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
          {form.modalTitle || "Form"}
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        {form.questions.length === 0 ? (
          <p className="text-xs text-[#b5bac1]">
            Add questions to see the modal.
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
          Cancel
        </span>
        <span className="rounded bg-[#5865f2] px-3 py-1.5 text-xs font-medium text-white">
          Submit
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
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
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
      if (!channelId) return "No channel";
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
      setRoles(assets.roles);
      setTemplates(templatesRes.templates);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load Forms.",
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
        err instanceof Error ? err.message : "Couldn't create the form.",
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
      setSuccess(`Template "${detail.name}" loaded.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't load the template.",
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
    enabled: draft.enabled,
    submitMode: draft.submitMode,
    requiredRoleIds: draft.requiredRoleIds,
    blockedRoleIds: draft.blockedRoleIds,
    pingRoleId: draft.pingRoleId,
    thankYouMessage: draft.thankYouMessage,
    acceptRoleId: draft.acceptRoleId,
  });

  type UpdateFormPayload = Parameters<typeof saveForm>[1];

  const save = async () => {
    if (editingId == null) {
      setError("No form being edited.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveForm(editingId, payload());
      applyFormToDraft(res.form);
      setSuccess("Form saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (editingId == null) {
      setError("No form being edited.");
      return;
    }
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await publishForm(editingId, payload());
      applyFormToDraft(res.form);
      setSuccess("Form published to Discord.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish.");
    } finally {
      setPublishing(false);
    }
  };

  const onDelete = async (form: InteractiveForm) => {
    if (
      !window.confirm(
        `Delete "${form.embedTitle}"? Its responses and the published message (if any) will be deleted.`,
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
      setSuccess("Form deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
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
          : "Couldn't load the responses.",
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
        Loading Forms…
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
            My Forms
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
            {editingId != null ? "Create/Edit" : "Create/Edit"}
          </TabsTrigger>
        </TabsList>

        {mainTab === "list" ? (
          <TabsContent className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {forms.length === 0
                  ? "No forms yet."
                  : `${forms.length}/${FORMS_MAX_PER_GUILD} formulario${forms.length === 1 ? "" : "s"}`}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={forms.length >= FORMS_MAX_PER_GUILD}
                onClick={() => void openCreate()}
              >
                <Plus className="size-4" aria-hidden />
                New
              </Button>
            </div>

            {forms.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
                <ClipboardList
                  className="size-8 text-primary/70"
                  aria-hidden
                />
                <p className="text-sm font-medium">No forms</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Create an interactive form with a Discord modal and a
                  reception channel.
                </p>
                <Button type="button" onClick={() => void openCreate()}>
                  Create form
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
                            {form.enabled ? null : (
                              <Badge>Closed</Badge>
                            )}
                            {form.submitMode === "once" ? (
                              <Badge>Once</Badge>
                            ) : null}
                            {form.publishedMessageId ? (
                              <Badge className="border-primary/40 bg-primary/15 text-primary">
                                Published
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Reception: #{channelName(form.receptionChannelId)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {form.questions.length}/{FORMS_MAX_QUESTIONS}{" "}
                            questions
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
                            View Responses
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(form)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void onDelete(form)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Delete
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
                      1. Base Message
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "questions"}
                      onClick={() => setBuilderTab("questions")}
                    >
                      2. Questions (Modal)
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "reception"}
                      onClick={() => setBuilderTab("reception")}
                    >
                      3. Reception
                    </TabsTrigger>
                  </TabsList>

                  {builderTab === "message" ? (
                    <TabsContent className="mt-4 space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Invitation embed
                          </CardTitle>
                          <CardDescription>
                            Message with a button that opens the modal.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label>
                              Load from an Embed Template (Optional)
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
                                      ? "No templates"
                                      : "Select a template"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  No template
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
                            <Label>Publish channel</Label>
                            <Select
                              value={draft.publishChannelId || undefined}
                              onValueChange={(value) =>
                                patch({ publishChannelId: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select channel" />
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
                            <Label>Embed title</Label>
                            <Input
                              value={draft.embedTitle}
                              maxLength={256}
                              onChange={(e) =>
                                patch({ embedTitle: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Description</Label>
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
                              label="Main image"
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
                              <Label>Button text</Label>
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
                            <Label>Modal title</Label>
                            <Input
                              value={draft.modalTitle}
                              maxLength={45}
                              onChange={(e) =>
                                patch({ modalTitle: e.target.value })
                              }
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Maximum 45 characters (Discord limit).
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}

                  {builderTab === "questions" ? (
                    <TabsContent className="mt-4 space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Discord allows a maximum of {FORMS_MAX_QUESTIONS} fields per
                        modal (text, dropdown, or file).
                      </p>
                      {draft.questions.map((question, index) => (
                        <Card key={question.id}>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium">
                                {question.label || `Question ${index + 1}`}
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
                              <Label>Question title</Label>
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
                                disabled={question.style === "FILE_UPLOAD"}
                                placeholder="Help text inside the field…"
                                onChange={(e) =>
                                  updateQuestion(index, {
                                    placeholder: e.target.value,
                                  })
                                }
                              />
                            </div>
                            {question.style === "STRING_SELECT" ? (
                              <div className="space-y-1.5">
                                <Label>Options (one per line)</Label>
                                <Textarea
                                  rows={4}
                                  value={question.options
                                    .map((opt) => opt.label)
                                    .join("\n")}
                                  placeholder={"PC\nPlayStation\nXbox"}
                                  onChange={(e) =>
                                    updateQuestion(index, {
                                      options: e.target.value
                                        .split("\n")
                                        .map((line) => line.trim())
                                        .filter(Boolean)
                                        .map((label) => ({
                                          label,
                                          value: label,
                                        })),
                                    })
                                  }
                                />
                              </div>
                            ) : null}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label>Type</Label>
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
                                  Required field
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
                        Add question
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
                            Reception channel
                          </CardTitle>
                          <CardDescription>
                            The bot will send an embed here for every completed
                            response.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                            <div>
                              <Label className="text-sm">Form open</Label>
                              <p className="text-[11px] text-muted-foreground">
                                If closed, the Discord button doesn't accept submissions.
                              </p>
                            </div>
                            <Switch
                              checked={draft.enabled}
                              onCheckedChange={(enabled) => patch({ enabled })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Log channel</Label>
                            <Select
                              value={draft.receptionChannelId || undefined}
                              onValueChange={(value) =>
                                patch({ receptionChannelId: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select channel" />
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
                            <Label>Submissions</Label>
                            <Select
                              value={draft.submitMode}
                              onValueChange={(value) =>
                                patch({
                                  submitMode:
                                    value === "once" ? "once" : "cooldown",
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cooldown">
                                  Cooldown (minutes)
                                </SelectItem>
                                <SelectItem value="once">
                                  Once per user
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {draft.submitMode === "cooldown" ? (
                          <div className="space-y-1.5">
                            <Label>Cooldown (Minutes)</Label>
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
                              Time a user must wait before submitting this form
                              again. 0 = no limit.
                            </p>
                          </div>
                          ) : null}
                          <RoleMultiSelect
                            label="Required roles"
                            roles={roles}
                            value={draft.requiredRoleIds}
                            onChange={(requiredRoleIds) =>
                              patch({ requiredRoleIds })
                            }
                            emptyHint="Anyone can submit."
                          />
                          <RoleMultiSelect
                            label="Blocked roles"
                            roles={roles}
                            value={draft.blockedRoleIds}
                            onChange={(blockedRoleIds) =>
                              patch({ blockedRoleIds })
                            }
                          />
                          <div className="space-y-1.5">
                            <Label>Ping staff</Label>
                            <Select
                              value={draft.pingRoleId || "none"}
                              onValueChange={(value) =>
                                patch({
                                  pingRoleId: value === "none" ? null : value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="No ping" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No ping</SelectItem>
                                {roles.map((role) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    @{role.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Role on accept</Label>
                            <Select
                              value={draft.acceptRoleId || "none"}
                              onValueChange={(value) =>
                                patch({
                                  acceptRoleId: value === "none" ? null : value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {roles.map((role) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    @{role.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Confirmation message</Label>
                            <Input
                              value={draft.thankYouMessage}
                              maxLength={500}
                              onChange={(e) =>
                                patch({ thankYouMessage: e.target.value })
                              }
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}
                </Tabs>
              </div>

              <Card className="sticky top-4 self-start">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>
                    {builderTab === "questions"
                      ? "Discord modal"
                      : "Invitation message"}
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
                      Questions:{" "}
                      <span className="font-mono text-foreground">
                        {draft.questions.length}/{FORMS_MAX_QUESTIONS}
                      </span>
                    </p>
                    <p>
                      Published:{" "}
                      <span className="font-mono text-foreground">
                        {draft.publishedMessageId ? "Yes" : "No"}
                      </span>
                    </p>
                    {dirty ? (
                      <p className="text-amber-500">Unsaved changes</p>
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
                      Save
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
                      Publish to Discord
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
            ? `Responses · ${responsesForm.embedTitle || responsesForm.modalTitle}`
            : "Responses"
        }
        description={`${responses.length} submission${responses.length === 1 ? "" : "s"}`}
        className="max-w-3xl"
      >
        <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!responsesForm || responses.length === 0}
            onClick={() => {
              if (!responsesForm) return;
              void downloadFormResponsesCsv(responsesForm.id).catch((err) =>
                setError(
                  err instanceof Error ? err.message : "Couldn't export.",
                ),
              );
            }}
          >
            <Download className="size-3.5" aria-hidden />
            CSV
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loadingResponses ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : responses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No responses for this form yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      User
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Date
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Detail
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
                          <td className="px-3 py-2.5">
                            <Badge>
                              {row.status === "accepted"
                                ? "Accepted"
                                : row.status === "rejected"
                                  ? "Rejected"
                                  : "Pending"}
                            </Badge>
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
                              {open ? "Hide" : "View"}
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
