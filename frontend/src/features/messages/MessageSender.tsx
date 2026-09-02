import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import {
  MESSAGE_CONTENT_MAX,
  MESSAGE_SEND_CHANNEL_TYPES,
} from "@adobos/shared";
import { fetchGuildAssets, sendChannelMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TEXT_CHANNEL_TYPES = new Set<number>(MESSAGE_SEND_CHANNEL_TYPES);

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; messageId: string }
  | { kind: "error"; message: string };

export function MessageSender() {
  const [channelId, setChannelId] = useState("");
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [channels, setChannels] = useState<
    Array<{ id: string; name: string; type: number; position: number }>
  >([]);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const textChannels = useMemo(
    () =>
      channels
        .filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
        .sort(
          (a, b) => a.position - b.position || a.name.localeCompare(b.name),
        ),
    [channels],
  );

  useEffect(() => {
    let cancelled = false;
    fetchGuildAssets()
      .then((data) => {
        if (cancelled) return;
        setChannels(data.channels);
        setAssetsError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAssetsError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los canales",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          Texto plano a un canal de texto o anuncios. El bot necesita permiso
          para hablar ahí.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="channelId">Canal destino</Label>
        {textChannels.length > 0 ? (
          <Select
            value={channelId || undefined}
            disabled={isSubmitting}
            onValueChange={setChannelId}
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
        )}
        {assetsError ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {assetsError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Mensaje</Label>
        <Textarea
          id="content"
          name="content"
          rows={5}
          maxLength={MESSAGE_CONTENT_MAX}
          placeholder="Escribe el mensaje que enviará el bot…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={isSubmitting}
          required
        />
        <p className="text-xs text-muted-foreground">
          {content.length}/{MESSAGE_CONTENT_MAX}
        </p>
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
