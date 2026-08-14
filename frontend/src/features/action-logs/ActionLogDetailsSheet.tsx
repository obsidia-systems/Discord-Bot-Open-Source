import type { ActionLogEntry } from "@adobos/shared";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet } from "@/components/ui/sheet";
import {
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  categoryBadgeClass,
} from "./labels";

interface ActionLogDetailsSheetProps {
  entry: ActionLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DiffBlock({
  oldValue,
  newValue,
}: {
  oldValue: string;
  newValue: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Antes
        </p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground/90">
          {oldValue || "*(vacío)*"}
        </pre>
      </div>
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Después
        </p>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground/90">
          {newValue || "*(vacío)*"}
        </pre>
      </div>
    </div>
  );
}

/** Panel lateral con detalle del evento y bloque Diff (antes / después). */
export function ActionLogDetailsSheet({
  entry,
  open,
  onOpenChange,
}: ActionLogDetailsSheetProps) {
  const oldContent =
    entry && typeof entry.details.oldContent === "string"
      ? entry.details.oldContent
      : null;
  const newContent =
    entry && typeof entry.details.newContent === "string"
      ? entry.details.newContent
      : null;
  const hasDiff = oldContent !== null || newContent !== null;
  const cachedFlag =
    entry && typeof entry.details.cached === "boolean"
      ? entry.details.cached
      : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      title={entry ? EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType : "Detalle"}
      description={entry?.summary}
      className="sm:max-w-lg"
    >
      {entry ? (
        <div className="space-y-4 pb-6">
          <div className="flex flex-wrap gap-2">
            <Badge className={categoryBadgeClass(entry.category)}>
              {CATEGORY_LABELS[entry.category]}
            </Badge>
            <Badge>
              {EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType}
            </Badge>
          </div>

          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Fecha</dt>
              <dd className="font-medium">
                {new Date(entry.createdAt).toLocaleString("es-MX")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ejecutor</dt>
              <dd className="font-medium">
                {entry.executorTag ?? entry.executorId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Objetivo</dt>
              <dd className="font-medium">
                {entry.targetTag ?? entry.targetId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Canal</dt>
              <dd className="font-medium">
                {entry.channelId ? `#${entry.channelId}` : "—"}
              </dd>
            </div>
          </dl>

          {hasDiff ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Comparación (Diff)</h3>
                <DiffBlock
                  oldValue={oldContent ?? ""}
                  newValue={newContent ?? ""}
                />
                {cachedFlag === false ? (
                  <p className="text-xs text-muted-foreground">
                    El contenido anterior no estaba en caché de discord.js
                    (mensajes antiguos o previos al arranque del bot).
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {Array.isArray(entry.details.attachments) &&
          (entry.details.attachments as unknown[]).length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Adjuntos</h3>
              <ul className="space-y-1 text-xs break-all text-muted-foreground">
                {(entry.details.attachments as string[]).map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
