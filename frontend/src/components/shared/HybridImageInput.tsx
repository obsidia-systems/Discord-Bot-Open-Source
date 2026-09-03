import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { uploadImageFile } from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** URL remota/ruta `/uploads/...`, archivo local pendiente, o vacío. */
export type HybridImageValue = string | File | null;

export interface HybridImageInputProps {
  id?: string;
  label: string;
  value: HybridImageValue;
  onChange: (value: HybridImageValue) => void;
  disabled?: boolean;
  placeholder?: string;
  maxSizeMb?: number;
  /**
   * Si es true, sube el archivo de inmediato a `/api/uploads/image`
   * y emite la ruta pública (útil en formularios que solo guardan strings).
   */
  uploadImmediately?: boolean;
  className?: string;
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}

/**
 * Input híbrido compacto: URL + clip para archivo + miniatura + limpiar.
 */
export function HybridImageInput({
  id: idProp,
  label,
  value,
  onChange,
  disabled,
  placeholder = "https://…",
  maxSizeMb = 5,
  uploadImmediately = false,
  className,
}: HybridImageInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const file = value instanceof File ? value : null;
  const objectUrl = useObjectUrl(file);
  const urlValue = typeof value === "string" ? value : "";
  const previewSrc = file
    ? objectUrl
    : urlValue.trim()
      ? resolvePublicAssetUrl(urlValue)
      : null;
  const textValue = file ? file.name : urlValue;
  const busy = Boolean(disabled || uploading);
  const hasValue = Boolean(file || urlValue.trim());

  async function applyFile(next: File): Promise<void> {
    setError(null);
    if (next.size > maxSizeMb * 1024 * 1024) {
      setError(`The image exceeds ${maxSizeMb}MB.`);
      return;
    }

    if (!uploadImmediately) {
      onChange(next);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadImageFile(next);
      onChange(result.path);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    void applyFile(next);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt=""
            className="size-10 shrink-0 rounded object-cover ring-1 ring-border"
            onError={(event) => {
              (event.target as HTMLImageElement).style.opacity = "0.35";
            }}
          />
        ) : null}

        <Input
          id={id}
          value={textValue}
          readOnly={Boolean(file)}
          disabled={busy}
          placeholder={placeholder}
          className={cn(
            "min-w-0 flex-1",
            file && "cursor-default text-muted-foreground",
          )}
          onChange={(event) => {
            if (file) return;
            const next = event.target.value;
            onChange(next.trim() ? next : null);
            setError(null);
          }}
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          disabled={busy}
          aria-label={`Upload file — ${label}`}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Paperclip className="size-4" aria-hidden />
          )}
        </Button>

        {hasValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            disabled={busy}
            aria-label={`Remove ${label}`}
            onClick={() => {
              onChange(null);
              setError(null);
            }}
          >
            <X className="size-4" />
          </Button>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={onFileChange}
        />
      </div>
      {error ? (
        <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Paste a URL or attach PNG/JPG/WEBP (max. {maxSizeMb}MB)
        </p>
      )}
    </div>
  );
}

/** Alias pedido en la refactorización UX. */
export { HybridImageInput as InputHibridoImagen };
