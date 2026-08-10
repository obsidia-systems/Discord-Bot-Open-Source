import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { sendChannelMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

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
        <label
          htmlFor="channelId"
          className="block text-sm font-medium text-foreground"
        >
          ID del canal
        </label>
        <input
          id="channelId"
          name="channelId"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ej. 123456789012345678"
          value={channelId}
          onChange={(event) => setChannelId(event.target.value)}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="content"
          className="block text-sm font-medium text-foreground"
        >
          Mensaje
        </label>
        <textarea
          id="content"
          name="content"
          rows={5}
          maxLength={2000}
          placeholder="Escribe el mensaje que enviará el bot…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          disabled={isSubmitting}
          required
        />
        <p className="text-xs text-muted-foreground">{content.length}/2000</p>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
          "bg-primary text-primary-foreground transition-opacity",
          "hover:opacity-90 disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {isSubmitting ? "Enviando…" : "Enviar a Discord"}
      </button>

      {feedback.kind === "ok" && (
        <p
          className="flex items-start gap-2 text-sm text-emerald-700"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Mensaje enviado (ID: {feedback.messageId})
        </p>
      )}

      {feedback.kind === "error" && (
        <p className="flex items-start gap-2 text-sm text-red-700" role="alert">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {feedback.message}
        </p>
      )}
    </form>
  );
}
