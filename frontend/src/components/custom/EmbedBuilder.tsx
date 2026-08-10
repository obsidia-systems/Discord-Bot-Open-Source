import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import type { SendEmbedRequest } from "@adobos/shared";
import { sendEmbedMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; messageId: string }
  | { kind: "error"; message: string };

const VARIABLE_HINTS = [
  { token: "{user}", tip: "Mención del usuario" },
  { token: "{username}", tip: "Nombre de usuario" },
  { token: "{server}", tip: "Nombre del servidor" },
  { token: "{channel}", tip: "Nombre del canal" },
  { token: "{#canal}", tip: "Link a un canal" },
  { token: "{&rol}", tip: "Mención de un rol" },
] as const;

const emptyForm: SendEmbedRequest = {
  channelId: "",
  content: "",
  title: "",
  description: "",
  color: "#C45C26",
  authorName: "",
  authorIconUrl: "",
  thumbnailUrl: "",
  imageUrl: "",
  footerText: "",
  footerIconUrl: "",
};

export function EmbedBuilder() {
  const [form, setForm] = useState<SendEmbedRequest>(emptyForm);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const previewColor = useMemo(() => {
    const raw = form.color?.trim().replace(/^#/, "") ?? "";
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : "#C45C26";
  }, [form.color]);

  const isSubmitting = feedback.kind === "loading";

  function update<K extends keyof SendEmbedRequest>(
    key: K,
    value: SendEmbedRequest[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback({ kind: "loading" });

    try {
      const result = await sendEmbedMessage(form);
      setFeedback({ kind: "ok", messageId: result.messageId });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div>
          <h2 className="font-display text-lg font-semibold">Creador de Embed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configura el embed y envíalo a Discord vía la API de Express.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="channelId">ID del canal *</Label>
          <Input
            id="channelId"
            value={form.channelId}
            onChange={(event) => update("channelId", event.target.value)}
            placeholder="123456789012345678"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Mensaje (opcional, fuera del embed)</Label>
          <Textarea
            id="content"
            value={form.content ?? ""}
            onChange={(event) => update("content", event.target.value)}
            maxLength={2000}
            disabled={isSubmitting}
            placeholder="Texto plano encima del embed…"
          />
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={form.title ?? ""}
              onChange={(event) => update("title", event.target.value)}
              maxLength={256}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              rows={5}
              value={form.description ?? ""}
              onChange={(event) => update("description", event.target.value)}
              maxLength={4096}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color (Hex)</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                value={form.color ?? ""}
                onChange={(event) => update("color", event.target.value)}
                placeholder="#C45C26"
                disabled={isSubmitting}
              />
              <input
                type="color"
                aria-label="Selector de color"
                className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                value={previewColor}
                onChange={(event) => update("color", event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorName">Autor</Label>
            <Input
              id="authorName"
              value={form.authorName ?? ""}
              onChange={(event) => update("authorName", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="authorIconUrl">Icono del autor (URL)</Label>
            <Input
              id="authorIconUrl"
              value={form.authorIconUrl ?? ""}
              onChange={(event) => update("authorIconUrl", event.target.value)}
              placeholder="https://…"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="thumbnailUrl">Thumbnail (URL)</Label>
            <Input
              id="thumbnailUrl"
              value={form.thumbnailUrl ?? ""}
              onChange={(event) => update("thumbnailUrl", event.target.value)}
              placeholder="https://…"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="imageUrl">Imagen grande (URL)</Label>
            <Input
              id="imageUrl"
              value={form.imageUrl ?? ""}
              onChange={(event) => update("imageUrl", event.target.value)}
              placeholder="https://…"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footerText">Footer</Label>
            <Input
              id="footerText"
              value={form.footerText ?? ""}
              onChange={(event) => update("footerText", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footerIconUrl">Icono del footer (URL)</Label>
            <Input
              id="footerIconUrl"
              value={form.footerIconUrl ?? ""}
              onChange={(event) => update("footerIconUrl", event.target.value)}
              placeholder="https://…"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting || !form.channelId.trim()}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {isSubmitting ? "Enviando…" : "Enviar embed"}
        </Button>

        {feedback.kind === "ok" && (
          <p className="flex items-start gap-2 text-sm text-emerald-700" role="status">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Embed enviado (ID: {feedback.messageId})
          </p>
        )}

        {feedback.kind === "error" && (
          <p className="flex items-start gap-2 text-sm text-red-700" role="alert">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {feedback.message}
          </p>
        )}
      </form>

      <aside className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-border bg-[#2b2d31] text-white shadow-sm">
          <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
            Vista previa
          </div>
          <div className="p-4">
            {form.content?.trim() && (
              <p className="mb-3 whitespace-pre-wrap text-sm text-white/90">
                {form.content}
              </p>
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
                    {form.title?.trim() && (
                      <p className="text-sm font-semibold text-white">
                        {form.title}
                      </p>
                    )}
                    {form.description?.trim() && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                        {form.description}
                      </p>
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
                {form.footerText?.trim() && (
                  <div className="flex items-center gap-2 pt-1 text-[11px] text-white/55">
                    {form.footerIconUrl?.trim() && (
                      <img
                        src={form.footerIconUrl}
                        alt=""
                        className="size-4 rounded-full object-cover"
                      />
                    )}
                    <span>{form.footerText}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
          <p className="font-medium text-foreground">Variables (próximamente)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Podrás usar estas variables en bienvenidas y plantillas. Por ahora el
            envío es literal.
          </p>
          <ul className="mt-3 space-y-1.5">
            {VARIABLE_HINTS.map((item) => (
              <li key={item.token} className="flex gap-2 text-xs">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">
                  {item.token}
                </code>
                <span className="text-muted-foreground">{item.tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
