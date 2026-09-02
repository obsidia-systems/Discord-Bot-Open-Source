import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { discordMarkdownRehype } from "@/lib/discordMarkdown";
import { CheckCircle2, Loader2, Save, Send, XCircle } from "lucide-react";
import {
  EMBED_AUTHOR_MAX,
  EMBED_FOOTER_MAX,
  groupEmbedFields,
  MESSAGE_SEND_CHANNEL_TYPES,
  sanitizeEmbedFields,
  sanitizeLinkActionRows,
  type EmbedPayload,
  type GuildAssetsResponse,
  type MessageActionRowInput,
  type SendEmbedRequest,
  type SentEmbedRecord,
} from "@adobos/shared";
import {
  editSentEmbed,
  fetchEmbedTemplate,
  fetchGuildAssets,
  saveEmbedTemplate,
  sendEmbedToLibrary,
} from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/api/client";
import type { EmbedMediaValue } from "@/lib/api/messages";
import { parseDiscordEmojis } from "@/lib/parseDiscordEmojis";
import { ButtonBuilder } from "@/features/messages/ButtonBuilder";
import { EmbedFieldsBuilder } from "@/features/messages/EmbedFieldsBuilder";
import { EmbedLibraryPanel } from "@/features/messages/EmbedLibraryPanel";
import { DiscordEmojiPicker } from "@/components/shared/DiscordEmojiPicker";
import {
  HybridImageInput,
  type HybridImageValue,
} from "@/components/shared/HybridImageInput";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VariableListBase } from "@/components/shared/VariableListBase";
import { cn } from "@/lib/utils";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

type EmbedTab = "general" | "contenido" | "imagenes" | "extra";
type TopTab = "creator" | "library";

type EmbedFormState = Omit<
  SendEmbedRequest,
  "imageUrl" | "thumbnailUrl" | "authorIconUrl" | "footerIconUrl"
> & {
  imageUrl: HybridImageValue;
  thumbnailUrl: HybridImageValue;
  authorIconUrl: HybridImageValue;
  footerIconUrl: HybridImageValue;
};

const VARIABLE_HINTS = [
  { token: "{user}", tip: "Mención del usuario" },
  { token: "{username}", tip: "Nombre de usuario" },
  { token: "{displayname}", tip: "Nombre en el servidor" },
  { token: "{server}", tip: "Nombre del servidor" },
  { token: "{reason}", tip: "Razón de la sanción (moderación)" },
  { token: "{moderator}", tip: "Nombre del moderador / bot" },
  { token: "{action}", tip: "Tipo de sanción (warn, kick…)" },
  { token: "{invite}", tip: "Invite de reingreso (solo kick)" },
  { token: "{channel}", tip: "Nombre del canal" },
  { token: "{#canal}", tip: "Link a un canal" },
  { token: "{&rol}", tip: "Mención de un rol" },
] as const;

const TEXT_CHANNEL_TYPES = new Set<number>(MESSAGE_SEND_CHANNEL_TYPES);

const STYLE_PREVIEW = {
  Primary: "bg-[#5865F2] text-white",
  Secondary: "bg-[#4e5058] text-white",
  Success: "bg-[#248046] text-white",
  Danger: "bg-[#DA373C] text-white",
  Link: "bg-transparent text-[#00a8fc] underline",
} as const;

const emptyForm: EmbedFormState = {
  channelId: "",
  content: "",
  title: "",
  url: "",
  description: "",
  color: "#C45C26",
  authorName: "",
  authorIconUrl: null,
  thumbnailUrl: null,
  imageUrl: null,
  footerText: "",
  footerIconUrl: null,
  timestamp: true,
  fields: [],
  components: [],
};

function insertAtCursor(
  text: string,
  insertion: string,
  start: number,
  end: number,
): { next: string; caret: number } {
  return {
    next: `${text.slice(0, start)}${insertion}${text.slice(end)}`,
    caret: start + insertion.length,
  };
}

function useMediaPreview(value: EmbedMediaValue): string | null {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    const next =
      typeof value === "string" && value.trim()
        ? resolvePublicAssetUrl(value)
        : null;
    setPreview(next);
  }, [value]);

  return preview;
}

function mediaToStoredUrl(value: HybridImageValue): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function formToEmbedPayload(form: EmbedFormState): EmbedPayload {
  return {
    content: form.content?.trim() || undefined,
    title: form.title?.trim() || undefined,
    url: form.url?.trim() || undefined,
    description: form.description?.trim() || undefined,
    color: form.color?.trim() || undefined,
    authorName: form.authorName?.trim() || undefined,
    authorIconUrl: mediaToStoredUrl(form.authorIconUrl),
    thumbnailUrl: mediaToStoredUrl(form.thumbnailUrl),
    imageUrl: mediaToStoredUrl(form.imageUrl),
    footerText: form.footerText?.trim() || undefined,
    footerIconUrl: mediaToStoredUrl(form.footerIconUrl),
    timestamp: Boolean(form.timestamp),
    fields: sanitizeEmbedFields(form.fields),
    components: sanitizeLinkActionRows(form.components),
  };
}

function applyEmbedPayloadToForm(
  prev: EmbedFormState,
  payload: EmbedPayload,
  channelId?: string,
): EmbedFormState {
  return {
    ...prev,
    channelId: channelId ?? prev.channelId,
    content: payload.content ?? "",
    title: payload.title ?? "",
    url: payload.url ?? "",
    description: payload.description ?? "",
    color: payload.color ?? "#C45C26",
    authorName: payload.authorName ?? "",
    authorIconUrl: payload.authorIconUrl ?? null,
    thumbnailUrl: payload.thumbnailUrl ?? null,
    imageUrl: payload.imageUrl ?? null,
    footerText: payload.footerText ?? "",
    footerIconUrl: payload.footerIconUrl ?? null,
    timestamp: Boolean(payload.timestamp),
    fields: sanitizeEmbedFields(payload.fields) ?? [],
    components: sanitizeLinkActionRows(payload.components) ?? [],
  };
}

export function EmbedBuilder() {
  const [topTab, setTopTab] = useState<TopTab>("creator");
  const [form, setForm] = useState<EmbedFormState>(emptyForm);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [tab, setTab] = useState<EmbedTab>("general");
  const [emojiTarget, setEmojiTarget] = useState<"content" | "description">(
    "content",
  );
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingSentId, setEditingSentId] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const previewColor = useMemo(() => {
    const raw = form.color?.trim().replace(/^#/, "") ?? "";
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : "#C45C26";
  }, [form.color]);

  const authorIconPreview = useMediaPreview(form.authorIconUrl);
  const thumbnailPreview = useMediaPreview(form.thumbnailUrl);
  const imagePreview = useMediaPreview(form.imageUrl);
  const footerIconPreview = useMediaPreview(form.footerIconUrl);

  const isSubmitting = feedback.kind === "loading";
  const components = form.components ?? [];
  const fields = form.fields ?? [];
  const textChannels = useMemo(
    () =>
      (assets?.channels ?? [])
        .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
        .sort(
          (a, b) => a.position - b.position || a.name.localeCompare(b.name),
        ),
    [assets],
  );
  const serverEmojis = assets?.emojis ?? [];
  const isEditing = editingSentId != null;

  useEffect(() => {
    let cancelled = false;
    fetchGuildAssets()
      .then((data) => {
        if (!cancelled) {
          setAssets(data);
          setAssetsError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssetsError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar assets",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof EmbedFormState>(
    key: K,
    value: EmbedFormState[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setComponents(rows: MessageActionRowInput[]): void {
    update("components", rows);
  }

  function insertEmoji(mention: string): void {
    const ref = emojiTarget === "content" ? contentRef : descriptionRef;
    const current =
      emojiTarget === "content" ? (form.content ?? "") : (form.description ?? "");
    const el = ref.current;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const { next, caret } = insertAtCursor(current, mention, start, end);
    update(emojiTarget, next);
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(caret, caret);
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback({ kind: "loading" });

    try {
      const payload = {
        ...form,
        fields: sanitizeEmbedFields(form.fields),
        components: sanitizeLinkActionRows(components),
      };

      if (editingSentId) {
        const result = await editSentEmbed(editingSentId, payload);
        if (result.orphaned) {
          setEditingSentId(null);
          setFeedback({
            kind: "ok",
            message:
              "El mensaje ya no existía en Discord; se limpió el registro huérfano.",
          });
        } else {
          setFeedback({
            kind: "ok",
            message: `Mensaje actualizado en Discord (ID: ${result.entry.messageId}).`,
          });
        }
      } else {
        const result = await sendEmbedToLibrary(payload);
        setFeedback({
          kind: "ok",
          message: `Mensaje enviado (ID: ${result.messageId}).`,
        });
      }
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  async function onConfirmSaveTemplate(): Promise<void> {
    const name = templateName.trim();
    if (!name) {
      setFeedback({
        kind: "error",
        message: "Escribe un nombre para la plantilla.",
      });
      return;
    }
    setSavingTemplate(true);
    try {
      const result = await saveEmbedTemplate({
        name,
        embedData: formToEmbedPayload(form),
        imageUrl: form.imageUrl,
        thumbnailUrl: form.thumbnailUrl,
        authorIconUrl: form.authorIconUrl,
        footerIconUrl: form.footerIconUrl,
      });
      setSaveModalOpen(false);
      setTemplateName("");
      setFeedback({
        kind: "ok",
        message: `Plantilla «${result.template.name}» guardada.`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "No se pudo guardar",
      });
    } finally {
      setSavingTemplate(false);
    }
  }

  function onEditSent(entry: SentEmbedRecord): void {
    setForm((prev) =>
      applyEmbedPayloadToForm(prev, entry.embedData, entry.channelId),
    );
    setEditingSentId(entry.id);
    setTopTab("creator");
    setFeedback({
      kind: "ok",
      message: "Modo edición: al guardar se actualizará el mensaje en Discord.",
    });
  }

  async function onLoadTemplateFromLibrary(templateId: number): Promise<void> {
    try {
      const detail = await fetchEmbedTemplate(templateId);
      setForm((prev) => applyEmbedPayloadToForm(prev, detail.embedData));
      setEditingSentId(null);
      setTopTab("creator");
      setFeedback({
        kind: "ok",
        message: `Plantilla «${detail.name}» cargada en el editor.`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "No se pudo cargar",
      });
    }
  }

  return (
    <div className="space-y-4">
      <Tabs>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-2">
          <TabsTrigger
            active={topTab === "creator"}
            onClick={() => setTopTab("creator")}
          >
            Creador de Embeds
          </TabsTrigger>
          <TabsTrigger
            active={topTab === "library"}
            onClick={() => setTopTab("library")}
          >
            Biblioteca (Mensajes y Plantillas)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {topTab === "library" ? (
        <EmbedLibraryPanel
          onEditSent={onEditSent}
          onLoadTemplate={(id) => {
            void onLoadTemplateFromLibrary(id);
          }}
          onToast={(message, kind) =>
            setFeedback({ kind, message })
          }
        />
      ) : (
    <form onSubmit={onSubmit} className="space-y-6">
      {isEditing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <span>
            Editando mensaje enviado en Discord. Los cambios se aplicarán con{" "}
            <code className="text-xs">message.edit()</code>.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingSentId(null);
              setFeedback({ kind: "idle" });
            }}
          >
            Cancelar edición
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Message & Embed Builder</CardTitle>
              <CardDescription>
                Texto, embed, emojis del servidor y botones de acción.
                {assets ? ` Servidor: ${assets.guildName}` : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs>
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
                  <TabsTrigger
                    active={tab === "general"}
                    onClick={() => setTab("general")}
                  >
                    General
                  </TabsTrigger>
                  <TabsTrigger
                    active={tab === "contenido"}
                    onClick={() => setTab("contenido")}
                  >
                    Contenido
                  </TabsTrigger>
                  <TabsTrigger
                    active={tab === "imagenes"}
                    onClick={() => setTab("imagenes")}
                  >
                    Imágenes
                  </TabsTrigger>
                  <TabsTrigger
                    active={tab === "extra"}
                    onClick={() => setTab("extra")}
                  >
                    Extra
                  </TabsTrigger>
                </TabsList>

                {tab === "general" && (
                  <TabsContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="channelId">Canal destino *</Label>
                      {textChannels.length > 0 ? (
                        <Select
                          value={form.channelId || undefined}
                          disabled={isSubmitting}
                          onValueChange={(channelId) =>
                            update("channelId", channelId)
                          }
                        >
                          <SelectTrigger id="channelId">
                            <SelectValue placeholder="Selecciona un canal…" />
                          </SelectTrigger>
                          <SelectContent>
                            {textChannels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                #{channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="channelId"
                          value={form.channelId}
                          onChange={(event) =>
                            update("channelId", event.target.value)
                          }
                          placeholder="123456789012345678"
                          required
                          disabled={isSubmitting}
                        />
                      )}
                      {assetsError && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {assetsError}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="message-content">
                          Mensaje (fuera del embed)
                        </Label>
                        <div
                          onFocusCapture={() => setEmojiTarget("content")}
                          onClick={() => setEmojiTarget("content")}
                        >
                          <DiscordEmojiPicker
                            serverEmojis={serverEmojis}
                            disabled={isSubmitting}
                            onSelect={(selection) =>
                              insertEmoji(
                                selection.mention ?? selection.display,
                              )
                            }
                          />
                        </div>
                      </div>
                      <Textarea
                        id="message-content"
                        ref={contentRef}
                        value={form.content ?? ""}
                        onFocus={() => setEmojiTarget("content")}
                        onChange={(event) =>
                          update("content", event.target.value)
                        }
                        maxLength={2000}
                        disabled={isSubmitting}
                        placeholder="Texto opcional encima del embed…"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message-color">Color (Hex)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="message-color"
                          value={form.color ?? ""}
                          onChange={(event) =>
                            update("color", event.target.value)
                          }
                          placeholder="#C45C26"
                          disabled={isSubmitting}
                        />
                        <input
                          type="color"
                          aria-label="Selector de color"
                          className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                          value={previewColor}
                          onChange={(event) =>
                            update("color", event.target.value)
                          }
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  </TabsContent>
                )}

                {tab === "contenido" && (
                  <TabsContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="message-title">Título</Label>
                      <Input
                        id="message-title"
                        value={form.title ?? ""}
                        onChange={(event) =>
                          update("title", event.target.value)
                        }
                        maxLength={256}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message-url">URL del título</Label>
                      <Input
                        id="message-url"
                        value={form.url ?? ""}
                        onChange={(event) => update("url", event.target.value)}
                        placeholder="https://…"
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="message-description">Descripción</Label>
                        <div
                          onFocusCapture={() => setEmojiTarget("description")}
                          onClick={() => setEmojiTarget("description")}
                        >
                          <DiscordEmojiPicker
                            serverEmojis={serverEmojis}
                            disabled={isSubmitting}
                            onSelect={(selection) =>
                              insertEmoji(
                                selection.mention ?? selection.display,
                              )
                            }
                          />
                        </div>
                      </div>
                      <Textarea
                        id="message-description"
                        ref={descriptionRef}
                        rows={6}
                        value={form.description ?? ""}
                        onFocus={() => setEmojiTarget("description")}
                        onChange={(event) =>
                          update("description", event.target.value)
                        }
                        maxLength={4096}
                        disabled={isSubmitting}
                        placeholder="Texto del embed…"
                      />
                    </div>

                    <EmbedFieldsBuilder
                      fields={fields}
                      onChange={(next) => update("fields", next)}
                      disabled={isSubmitting}
                    />
                  </TabsContent>
                )}

                {tab === "imagenes" && (
                  <TabsContent className="space-y-5">
                    <HybridImageInput
                      id="message-imageUrl"
                      label="Imagen principal"
                      value={form.imageUrl}
                      onChange={(next) => update("imageUrl", next)}
                      disabled={isSubmitting}
                    />
                    <HybridImageInput
                      id="message-thumbnailUrl"
                      label="Thumbnail"
                      value={form.thumbnailUrl}
                      onChange={(next) => update("thumbnailUrl", next)}
                      disabled={isSubmitting}
                    />
                  </TabsContent>
                )}

                {tab === "extra" && (
                  <TabsContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="message-authorName">Autor</Label>
                      <Input
                        id="message-authorName"
                        value={form.authorName ?? ""}
                        maxLength={EMBED_AUTHOR_MAX}
                        onChange={(event) =>
                          update("authorName", event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <HybridImageInput
                      id="message-authorIconUrl"
                      label="Icono del autor"
                      value={form.authorIconUrl}
                      onChange={(next) => update("authorIconUrl", next)}
                      disabled={isSubmitting}
                    />

                    <div className="space-y-2">
                      <Label htmlFor="message-footerText">Footer</Label>
                      <Input
                        id="message-footerText"
                        value={form.footerText ?? ""}
                        maxLength={EMBED_FOOTER_MAX}
                        onChange={(event) =>
                          update("footerText", event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <HybridImageInput
                      id="message-footerIconUrl"
                      label="Icono del footer"
                      value={form.footerIconUrl}
                      onChange={(next) => update("footerIconUrl", next)}
                      disabled={isSubmitting}
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(form.timestamp)}
                        disabled={isSubmitting}
                        onCheckedChange={(checked) =>
                          update("timestamp", checked === true)
                        }
                      />
                      Mostrar timestamp (hora actual) en el embed
                    </label>
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>

          <ButtonBuilder
            rows={components}
            onChange={setComponents}
            disabled={isSubmitting}
          />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={isSubmitting || !form.channelId.trim()}
                className="flex-1"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                {isSubmitting
                  ? isEditing
                    ? "Actualizando…"
                    : "Enviando…"
                  : isEditing
                    ? "Actualizar Mensaje en Discord"
                    : "Enviar mensaje"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || savingTemplate}
                onClick={() => {
                  setTemplateName("");
                  setSaveModalOpen(true);
                }}
              >
                <Save className="size-4" aria-hidden />
                Guardar como Plantilla
              </Button>
            </div>

            {feedback.kind === "ok" && (
              <p
                className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                {feedback.message}
              </p>
            )}

            {feedback.kind === "error" && (
              <p
                className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400"
                role="alert"
              >
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {feedback.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-lg border border-border bg-[#2b2d31] text-white shadow-sm">
            <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
              Vista previa
            </div>
            <div className="space-y-3 p-4">
              {form.content?.trim() && (
                <div className="discord-md text-sm text-white/90">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={discordMarkdownRehype}
                  >
                    {parseDiscordEmojis(form.content)}
                  </Markdown>
                </div>
              )}

              <div
                className="overflow-hidden rounded bg-[#1e1f22]"
                style={{ borderLeft: `4px solid ${previewColor}` }}
              >
                <div className="space-y-2 p-3">
                  {form.authorName?.trim() && (
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {authorIconPreview && (
                        <img
                          src={authorIconPreview}
                          alt=""
                          className="size-5 rounded-full object-cover"
                        />
                      )}
                      <span>{form.authorName}</span>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      {form.title?.trim() &&
                        (form.url?.trim() ? (
                          <a
                            href={form.url}
                            className="text-sm font-semibold text-[#00a8fc] hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {form.title}
                          </a>
                        ) : (
                          <p className="text-sm font-semibold text-white">
                            {form.title}
                          </p>
                        ))}
                      {form.description?.trim() && (
                        <div className="discord-md mt-1 text-sm text-white/80">
                          <Markdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={discordMarkdownRehype}
                          >
                            {parseDiscordEmojis(form.description)}
                          </Markdown>
                        </div>
                      )}
                    </div>
                    {thumbnailPreview && (
                      <img
                        src={thumbnailPreview}
                        alt=""
                        className="size-16 rounded object-cover"
                      />
                    )}
                  </div>
                  {fields.length > 0 && (
                    <div className="space-y-2">
                      {groupEmbedFields(sanitizeEmbedFields(fields) ?? []).map(
                        (row, rowIndex) => (
                          <div
                            key={`preview-fields-${rowIndex}`}
                            className="grid gap-2"
                            style={{
                              gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                            }}
                          >
                            {row.map((field, fieldIndex) => (
                              <div key={`pf-${rowIndex}-${fieldIndex}`}>
                                <p className="text-xs font-semibold text-white/90">
                                  {field.name}
                                </p>
                                <p className="whitespace-pre-wrap text-xs text-white/70">
                                  {field.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt=""
                      className="mt-2 max-h-40 w-full rounded object-cover"
                    />
                  )}
                  {(form.footerText?.trim() || form.timestamp) && (
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-white/55">
                      {footerIconPreview && (
                        <img
                          src={footerIconPreview}
                          alt=""
                          className="size-4 rounded-full object-cover"
                        />
                      )}
                      <span>
                        {form.footerText?.trim()}
                        {form.footerText?.trim() && form.timestamp ? " • " : ""}
                        {form.timestamp
                          ? new Date().toLocaleString("es-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : null}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {components.length > 0 && (
                <div className="space-y-2">
                  {components.map((row, rowIndex) => (
                    <div
                      key={`preview-row-${rowIndex}`}
                      className="flex flex-wrap gap-2"
                    >
                      {row.buttons.map((button, buttonIndex) => (
                        <span
                          key={`preview-btn-${rowIndex}-${buttonIndex}`}
                          className={cn(
                            "inline-flex h-8 items-center rounded px-3 text-xs font-medium",
                            STYLE_PREVIEW[button.style],
                          )}
                        >
                          {button.label || "Botón"}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {assets && assets.stickers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Stickers del servidor</CardTitle>
                <CardDescription>
                  Referencia visual (envío en una iteración posterior).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {assets.stickers.slice(0, 8).map((sticker) => (
                    <img
                      key={sticker.id}
                      src={sticker.url}
                      alt={sticker.name}
                      title={sticker.name}
                      className="aspect-square rounded-md border border-border object-cover"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <VariableListBase
            items={VARIABLE_HINTS}
            description="Clic para copiar. En moderación se interpolan al enviar el DM."
          />
        </div>
      </div>
    </form>
      )}

      <AlertDialog
        open={saveModalOpen}
        title="Guardar como Plantilla"
        description={
          <div className="space-y-3">
            <p>Guarda el embed actual sin enviarlo a Discord.</p>
            <div className="space-y-2">
              <Label htmlFor="save-template-name">Nombre descriptivo</Label>
              <Input
                id="save-template-name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="ej. Warn DM, Anuncio…"
                disabled={savingTemplate}
                autoFocus
              />
            </div>
          </div>
        }
        confirmLabel="Guardar plantilla"
        cancelLabel="Cancelar"
        confirming={savingTemplate}
        onCancel={() => setSaveModalOpen(false)}
        onConfirm={() => void onConfirmSaveTemplate()}
      />
    </div>
  );
}
