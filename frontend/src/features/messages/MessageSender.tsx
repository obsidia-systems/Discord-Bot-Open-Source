import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { sendChannelMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; messageId: string }
  | { kind: "error"; message: string };

export function MessageSender() {
  const [channelId, setChannelId] = useState("");
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const isSubmitting = feedback.kind === "loading";
  const canSubmit =
    channelId.trim().length > 0 && content.trim().length > 0 && !isSubmitting;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    setFeedback({ kind: "loading" });
    try {
      const result = await sendChannelMessage({
        channelId: channelId.trim(),
        content: content.trim(),
      });
      setFeedback({ kind: "ok", messageId: result.messageId });
      setContent("");
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-lg border border-border bg-card/80 p-6 shadow-sm backdrop-blur"
    >
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Enviar mensaje
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envía texto simple a un canal de Discord. El bot debe tener permiso para
          hablar en ese canal.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="channelId">ID del canal</Label>
        <Input
          id="channelId"
          name="channelId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ej. 123456789012345678"
          value={channelId}
          onChange={(event) => setChannelId(event.target.value)}
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Mensaje</Label>
        <Textarea
          id="content"
          name="content"
          rows={5}
          maxLength={2000}
          placeholder="Escribe el mensaje que enviará el bot…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={isSubmitting}
          required
        />
        <p className="text-xs text-muted-foreground">{content.length}/2000</p>
      </div>

      <Button type="submit" disabled={!canSubmit}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {isSubmitting ? "Enviando…" : "Enviar a Discord"}
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
    </form>
  );
}
