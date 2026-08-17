import type {
  FormQuestion,
  FormQuestionStyle,
  FormsConfig,
  GuildChannelAsset,
} from "@adobos/shared";
import {
  FORMS_MAX_QUESTIONS,
  defaultFormsConfig,
} from "@adobos/shared";
import {
  fetchFormsConfig,
  fetchGuildAssets,
  publishFormsConfig,
  saveFormsConfig,
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
import { cn } from "@/lib/utils";
import {
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type BuilderTab = "message" | "questions" | "reception";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);

const STYLE_LABELS: Record<FormQuestionStyle, string> = {
  SHORT: "Texto corto",
  PARAGRAPH: "Párrafo",
};

function configFingerprint(config: FormsConfig): string {
  return JSON.stringify({
    modalTitle: config.modalTitle,
    buttonLabel: config.buttonLabel,
    embedTitle: config.embedTitle,
    embedDescription: config.embedDescription,
    embedColor: config.embedColor,
    publishChannelId: config.publishChannelId,
    receptionChannelId: config.receptionChannelId,
    questions: config.questions.map((q) => ({
      id: q.id,
      label: q.label,
      style: q.style,
      required: q.required,
    })),
  });
}

function newQuestion(): FormQuestion {
  return {
    id: `q${Date.now().toString(36)}`,
    label: "Nueva pregunta",
    style: "SHORT",
    required: true,
  };
}

function FormsEmbedPreview({ config }: { config: FormsConfig }) {
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1] shadow-sm">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: config.embedColor || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <p className="text-sm font-semibold text-white">
            {config.embedTitle || "Sin título"}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
            {config.embedDescription || "Sin descripción"}
          </p>
          <button
            type="button"
            className="mt-1 rounded bg-[#5865f2] px-3 py-1.5 text-xs font-medium text-white"
          >
            {config.buttonLabel || "Abrir formulario"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormsModalPreview({ config }: { config: FormsConfig }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#1e1f22] bg-[#313338] shadow-xl">
      <div className="border-b border-black/20 px-4 py-3">
        <p className="text-sm font-semibold text-white">
          {config.modalTitle || "Formulario"}
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        {config.questions.length === 0 ? (
          <p className="text-xs text-[#b5bac1]">
            Añade preguntas para ver el modal.
          </p>
        ) : (
          config.questions.map((q) => (
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
                {q.style === "PARAGRAPH" ? "Respuesta larga…" : "Respuesta…"}
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
  const [config, setConfig] = useState<FormsConfig>(() =>
    defaultFormsConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(defaultFormsConfig()),
  );
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [tab, setTab] = useState<BuilderTab>("message");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, assets] = await Promise.all([
        fetchFormsConfig(),
        fetchGuildAssets(),
      ]);
      setConfig(cfgRes.config);
      setSavedFingerprint(configFingerprint(cfgRes.config));
      setChannels(assets.channels);
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

  const patch = (partial: Partial<FormsConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setSuccess(null);
  };

  const updateQuestion = (
    index: number,
    partial: Partial<FormQuestion>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    }));
    setSuccess(null);
  };

  const removeQuestion = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
    setSuccess(null);
  };

  const addQuestion = () => {
    setConfig((prev) => {
      if (prev.questions.length >= FORMS_MAX_QUESTIONS) return prev;
      return {
        ...prev,
        questions: [...prev.questions, newQuestion()],
      };
    });
    setSuccess(null);
  };

  const payload = () => ({
    modalTitle: config.modalTitle,
    buttonLabel: config.buttonLabel,
    embedTitle: config.embedTitle,
    embedDescription: config.embedDescription,
    embedColor: config.embedColor,
    publishChannelId: config.publishChannelId,
    receptionChannelId: config.receptionChannelId,
    questions: config.questions,
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveFormsConfig(payload());
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      setSuccess("Formulario guardado.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await publishFormsConfig(payload());
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      setSuccess("Formulario publicado en Discord.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo publicar.",
      );
    } finally {
      setPublishing(false);
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs>
            <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
              <TabsTrigger
                type="button"
                active={tab === "message"}
                onClick={() => setTab("message")}
              >
                1. Mensaje Base
              </TabsTrigger>
              <TabsTrigger
                type="button"
                active={tab === "questions"}
                onClick={() => setTab("questions")}
              >
                2. Preguntas (Modal)
              </TabsTrigger>
              <TabsTrigger
                type="button"
                active={tab === "reception"}
                onClick={() => setTab("reception")}
              >
                3. Recepción
              </TabsTrigger>
            </TabsList>

            {tab === "message" ? (
              <TabsContent className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Embed de invitación
                    </CardTitle>
                    <CardDescription>
                      Mensaje con botón que abre el modal en Discord.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Canal de publicación</Label>
                      <Select
                        value={config.publishChannelId ?? undefined}
                        onValueChange={(publishChannelId) =>
                          patch({ publishChannelId })
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
                      <Label htmlFor="embedTitle">Título del embed</Label>
                      <Input
                        id="embedTitle"
                        value={config.embedTitle}
                        maxLength={256}
                        onChange={(e) =>
                          patch({ embedTitle: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="embedDescription">Descripción</Label>
                      <Textarea
                        id="embedDescription"
                        value={config.embedDescription}
                        rows={4}
                        onChange={(e) =>
                          patch({ embedDescription: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="embedColor">Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="embedColor"
                            type="color"
                            className="h-9 w-12 cursor-pointer p-1"
                            value={config.embedColor}
                            onChange={(e) =>
                              patch({ embedColor: e.target.value })
                            }
                          />
                          <Input
                            value={config.embedColor}
                            onChange={(e) =>
                              patch({ embedColor: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="buttonLabel">Texto del botón</Label>
                        <Input
                          id="buttonLabel"
                          value={config.buttonLabel}
                          maxLength={80}
                          onChange={(e) =>
                            patch({ buttonLabel: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="modalTitle">Título del modal</Label>
                      <Input
                        id="modalTitle"
                        value={config.modalTitle}
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

            {tab === "questions" ? (
              <TabsContent className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Preguntas del modal
                    </CardTitle>
                    <CardDescription>
                      Discord permite máximo {FORMS_MAX_QUESTIONS} campos de
                      texto por modal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {config.questions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center">
                        <p className="text-sm text-muted-foreground">
                          No hay preguntas configuradas
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addQuestion}
                        >
                          <Plus className="size-4" />
                          Añadir pregunta
                        </Button>
                      </div>
                    ) : (
                      config.questions.map((question, index) => (
                        <div
                          key={question.id}
                          className="relative rounded-lg border border-border bg-muted/20 p-4 pr-12"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                            aria-label="Eliminar pregunta"
                            onClick={() => removeQuestion(index)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-1.5 md:col-span-2">
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
                            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                              <Label htmlFor={`req-${question.id}`}>
                                Campo obligatorio
                              </Label>
                              <Switch
                                id={`req-${question.id}`}
                                checked={question.required}
                                onCheckedChange={(required) =>
                                  updateQuestion(index, { required })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {config.questions.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          config.questions.length >= FORMS_MAX_QUESTIONS
                        }
                        onClick={addQuestion}
                      >
                        <Plus className="size-4" />
                        Añadir pregunta
                        <Badge className="ml-1 normal-case tracking-normal">
                          {config.questions.length}/{FORMS_MAX_QUESTIONS}
                        </Badge>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            {tab === "reception" ? (
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
                  <CardContent className="space-y-1.5">
                    <Label>Canal de logs</Label>
                    <Select
                      value={config.receptionChannelId ?? undefined}
                      onValueChange={(receptionChannelId) =>
                        patch({ receptionChannelId })
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
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-4 self-start">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vista previa</CardTitle>
              <CardDescription>
                {tab === "questions"
                  ? "Modal emergente en Discord"
                  : "Mensaje base con botón"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tab === "questions" ? (
                <FormsModalPreview config={config} />
              ) : (
                <FormsEmbedPreview config={config} />
              )}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Preguntas</span>
                  <span className="font-mono text-xs">
                    {config.questions.length}/{FORMS_MAX_QUESTIONS}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Publicado</span>
                  <span className="text-xs">
                    {config.publishedMessageId ? "Sí" : "No"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  disabled={publishing}
                  onClick={() => void publish()}
                >
                  {publishing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Publicar en Discord
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
