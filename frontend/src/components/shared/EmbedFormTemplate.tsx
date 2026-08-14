import { useMemo, useRef, useState } from "react";
import type { GuildEmojiAsset, EmbedPayload } from "@adobos/shared";
import { DiscordEmojiPicker } from "@/components/shared/DiscordEmojiPicker";
import { HybridImageInput } from "@/components/shared/HybridImageInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

interface EmbedFormTemplateProps {
  value: EmbedPayload;
  onChange: (next: EmbedPayload) => void;
  serverEmojis?: GuildEmojiAsset[];
  disabled?: boolean;
  /** Prefijo de ids para evitar colisiones si hay varios formularios. */
  idPrefix?: string;
  /** Oculta autor/footer/imágenes bajo «Opciones avanzadas». */
  compact?: boolean;
  /** Oculta el textarea de contenido fuera del embed. */
  hideOuterContent?: boolean;
}

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

/** Formulario reutilizable de campos de embed (sin canal ni botones). */
export function EmbedFormTemplate({
  value,
  onChange,
  serverEmojis = [],
  disabled,
  idPrefix = "embed",
  compact = false,
  hideOuterContent = false,
}: EmbedFormTemplateProps) {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [emojiTarget, setEmojiTarget] = useState<"content" | "description">(
    "description",
  );
  const [showAdvanced, setShowAdvanced] = useState(!compact);

  const previewColor = useMemo(() => {
    const raw = value.color?.trim().replace(/^#/, "") ?? "";
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : "#C45C26";
  }, [value.color]);

  function update<K extends keyof EmbedPayload>(key: K, next: EmbedPayload[K]): void {
    onChange({ ...value, [key]: next });
  }

  function insertEmoji(mention: string): void {
    const ref = emojiTarget === "content" ? contentRef : descriptionRef;
    const current =
      emojiTarget === "content" ? (value.content ?? "") : (value.description ?? "");
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

  return (
    <div className="space-y-5">
      {!hideOuterContent ? (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={`${idPrefix}-content`}>
                Mensaje (fuera del embed)
              </Label>
              <div
                onFocusCapture={() => setEmojiTarget("content")}
                onClick={() => setEmojiTarget("content")}
              >
                <DiscordEmojiPicker
                  serverEmojis={serverEmojis}
                  disabled={disabled}
                  onSelect={(selection) =>
                    insertEmoji(selection.mention ?? selection.display)
                  }
                />
              </div>
            </div>
            <Textarea
              id={`${idPrefix}-content`}
              ref={contentRef}
              value={value.content ?? ""}
              onFocus={() => setEmojiTarget("content")}
              onChange={(event) => update("content", event.target.value)}
              maxLength={2000}
              disabled={disabled}
              placeholder="Texto opcional encima del embed…"
            />
          </div>
          <Separator />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-title`}>Título</Label>
          <Input
            id={`${idPrefix}-title`}
            value={value.title ?? ""}
            onChange={(event) => update("title", event.target.value)}
            maxLength={256}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-url`}>URL del título</Label>
          <Input
            id={`${idPrefix}-url`}
            value={value.url ?? ""}
            onChange={(event) => update("url", event.target.value)}
            placeholder="https://…"
            disabled={disabled}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor={`${idPrefix}-description`}>Descripción</Label>
            <div
              onFocusCapture={() => setEmojiTarget("description")}
              onClick={() => setEmojiTarget("description")}
            >
              <DiscordEmojiPicker
                serverEmojis={serverEmojis}
                disabled={disabled}
                onSelect={(selection) =>
                  insertEmoji(selection.mention ?? selection.display)
                }
              />
            </div>
          </div>
          <Textarea
            id={`${idPrefix}-description`}
            ref={descriptionRef}
            rows={5}
            value={value.description ?? ""}
            onFocus={() => setEmojiTarget("description")}
            onChange={(event) => update("description", event.target.value)}
            maxLength={4096}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-color`}>Color (Hex)</Label>
          <div className="flex gap-2">
            <Input
              id={`${idPrefix}-color`}
              value={value.color ?? ""}
              onChange={(event) => update("color", event.target.value)}
              placeholder="#C45C26"
              disabled={disabled}
            />
            <input
              type="color"
              aria-label="Selector de color"
              className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
              value={previewColor}
              onChange={(event) => update("color", event.target.value)}
              disabled={disabled}
            />
          </div>
        </div>

        {compact ? (
          <div className="sm:col-span-2">
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
            </button>
          </div>
        ) : null}

        {showAdvanced ? (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-authorName`}>Autor</Label>
              <Input
                id={`${idPrefix}-authorName`}
                value={value.authorName ?? ""}
                onChange={(event) => update("authorName", event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <HybridImageInput
                id={`${idPrefix}-authorIconUrl`}
                label="Icono del autor"
                value={value.authorIconUrl?.trim() ? value.authorIconUrl : null}
                onChange={(next) =>
                  update("authorIconUrl", typeof next === "string" ? next : "")
                }
                uploadImmediately
                disabled={disabled}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <HybridImageInput
                id={`${idPrefix}-thumbnailUrl`}
                label="Thumbnail"
                value={value.thumbnailUrl?.trim() ? value.thumbnailUrl : null}
                onChange={(next) =>
                  update(
                    "thumbnailUrl",
                    typeof next === "string" ? next : "",
                  )
                }
                uploadImmediately
                disabled={disabled}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <HybridImageInput
                id={`${idPrefix}-imageUrl`}
                label="Imagen principal"
                value={value.imageUrl?.trim() ? value.imageUrl : null}
                onChange={(next) =>
                  update("imageUrl", typeof next === "string" ? next : "")
                }
                uploadImmediately
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-footerText`}>Footer</Label>
              <Input
                id={`${idPrefix}-footerText`}
                value={value.footerText ?? ""}
                onChange={(event) => update("footerText", event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <HybridImageInput
                id={`${idPrefix}-footerIconUrl`}
                label="Icono del footer"
                value={value.footerIconUrl?.trim() ? value.footerIconUrl : null}
                onChange={(next) =>
                  update("footerIconUrl", typeof next === "string" ? next : "")
                }
                uploadImmediately
                disabled={disabled}
              />
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={Boolean(value.timestamp)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  update("timestamp", checked === true)
                }
              />
              Mostrar timestamp (hora actual) en el embed
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}

export const emptyEmbedPayload: EmbedPayload = {
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
};
