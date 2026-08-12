import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import type {
  GuildAssetsResponse,
  MessageActionRowInput,
  SendEmbedRequest,
} from "@adobos/shared";
import { fetchGuildAssets, sendEmbedMessage } from "@/lib/api";
import { parseDiscordEmojis } from "@/lib/parseDiscordEmojis";
import { ButtonBuilder } from "@/features/messages/ButtonBuilder";
import { DiscordEmojiPicker } from "@/components/shared/DiscordEmojiPicker";
import { HybridImageInput } from "@/components/shared/HybridImageInput";
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
  | { kind: "ok"; messageId: string }
  | { kind: "error"; message: string };

type EmbedTab = "general" | "contenido" | "imagenes" | "extra";

const VARIABLE_HINTS = [
  { token: "{user}", tip: "Mención del usuario" },
  { token: "{username}", tip: "Nombre de usuario" },
  { token: "{server}", tip: "Nombre del servidor" },
  { token: "{channel}", tip: "Nombre del canal" },
  { token: "{#canal}", tip: "Link a un canal" },
  { token: "{&rol}", tip: "Mención de un rol" },
] as const;

const STYLE_PREVIEW = {
  Primary: "bg-[#5865F2] text-white",
  Secondary: "bg-[#4e5058] text-white",
  Success: "bg-[#248046] text-white",
  Danger: "bg-[#DA373C] text-white",
  Link: "bg-transparent text-[#00a8fc] underline",
} as const;

const emptyForm: SendEmbedRequest = {
  channelId: "",
  content: "",
  title: "",
  url: "",
  description: "",
  color: "#C45C26",
  authorName: "",
  authorIconUrl: "",
  thumbnailUrl: "",
  imageUrl: "",
  footerText: "",
  footerIconUrl: "",
  timestamp: true,
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

export function EmbedBuilder() {
  const [form, setForm] = useState<SendEmbedRequest>(emptyForm);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [tab, setTab] = useState<EmbedTab>("general");
  const [emojiTarget, setEmojiTarget] = useState<"content" | "description">(
    "content",
  );
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const previewColor = useMemo(() => {
    const raw = form.color?.trim().replace(/^#/, "") ?? "";
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : "#C45C26";
  }, [form.color]);

  const isSubmitting = feedback.kind === "loading";
  const components = form.components ?? [];
  const serverEmojis = assets?.emojis ?? [];

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

  function update<K extends keyof SendEmbedRequest>(
    key: K,
    value: SendEmbedRequest[K],
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
      const payload: SendEmbedRequest = {
        ...form,
        components: components.length > 0 ? components : undefined,
      };
      const result = await sendEmbedMessage(payload);
      setFeedback({ kind: "ok", messageId: result.messageId });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda */}
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
                      {assets && assets.channels.length > 0 ? (
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
                            {assets.channels.map((channel) => (
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
                      />
                    </div>
                  </TabsContent>
                )}

                {tab === "imagenes" && (
                  <TabsContent className="space-y-5">
                    <HybridImageInput
                      id="message-imageUrl"
                      label="Imagen principal"
                      value={form.imageUrl ?? ""}
                      onChange={(next) => update("imageUrl", next)}
                      disabled={isSubmitting}
                    />
                    <HybridImageInput
                      id="message-thumbnailUrl"
                      label="Thumbnail"
                      value={form.thumbnailUrl ?? ""}
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
                        onChange={(event) =>
                          update("authorName", event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <HybridImageInput
                      id="message-authorIconUrl"
                      label="Icono del autor"
                      value={form.authorIconUrl ?? ""}
                      onChange={(next) => update("authorIconUrl", next)}
                      disabled={isSubmitting}
                    />

                    <div className="space-y-2">
                      <Label htmlFor="message-footerText">Footer</Label>
                      <Input
                        id="message-footerText"
                        value={form.footerText ?? ""}
                        onChange={(event) =>
                          update("footerText", event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <HybridImageInput
                      id="message-footerIconUrl"
                      label="Icono del footer"
                      value={form.footerIconUrl ?? ""}
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
            <Button
              type="submit"
              disabled={isSubmitting || !form.channelId.trim()}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {isSubmitting ? "Enviando…" : "Enviar mensaje"}
            </Button>

            {feedback.kind === "ok" && (
              <p
                className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                Mensaje enviado (ID: {feedback.messageId})
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

        {/* Columna derecha sticky */}
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
                    rehypePlugins={[rehypeRaw]}
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
                      {form.authorIconUrl?.trim() && (
                        <img
                          src={form.authorIconUrl}
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
                            rehypePlugins={[rehypeRaw]}
                          >
                            {parseDiscordEmojis(form.description)}
                          </Markdown>
                        </div>
                      )}
                    </div>
                    {form.thumbnailUrl?.trim() && (
                      <img
                        src={form.thumbnailUrl}
                        alt=""
                        className="size-16 rounded object-cover"
                      />
                    )}
                  </div>
                  {form.imageUrl?.trim() && (
                    <img
                      src={form.imageUrl}
                      alt=""
                      className="mt-2 max-h-40 w-full rounded object-cover"
                    />
                  )}
                  {(form.footerText?.trim() || form.timestamp) && (
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-white/55">
                      {form.footerIconUrl?.trim() && (
                        <img
                          src={form.footerIconUrl}
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
            description="Clic para copiar. El envío actual es literal."
          />
        </div>
      </div>
    </form>
  );
}
