import { useCallback, useEffect, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ImageDropzoneProps {
  id: string;
  label: string;
  /** Vista previa actual (URL remota u object URL). */
  previewUrl: string | null;
  disabled?: boolean;
  acceptHint?: string;
  maxSizeMb?: number;
  /** Incluye GIF por defecto para avatares Discord. */
  acceptGif?: boolean;
  onFile: (file: File | null) => void;
}

/**
 * Dropzone de imagen sin modo URL — el archivo se entrega al padre.
 */
export function ImageDropzone({
  id,
  label,
  previewUrl,
  disabled,
  acceptHint,
  maxSizeMb = 8,
  acceptGif = true,
  onFile,
}: ImageDropzoneProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accept: Record<string, string[]> = {
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"],
  };
  if (acceptGif) {
    accept["image/gif"] = [".gif"];
  }

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setError(null);
      if (rejected.length > 0) {
        setError(
          rejected[0]?.errors[0]?.message ??
            "Invalid file.",
        );
        return;
      }
      const file = accepted[0];
      if (!file) return;
      setBusy(true);
      onFile(file);
      setBusy(false);
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: maxSizeMb * 1024 * 1024,
    accept,
    disabled: disabled || busy,
  });

  useEffect(() => {
    if (!previewUrl) setError(null);
  }, [previewUrl]);

  const formats = acceptGif ? "PNG, JPG, GIF, WEBP" : "PNG, JPG, WEBP";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors",
          isDragActive
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
          (busy || disabled) && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} id={id} />
        {busy ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <Upload className="size-6 text-muted-foreground" aria-hidden />
        )}
        <p className="text-xs font-medium">
          {isDragActive
            ? "Drop the image…"
            : acceptHint ??
              `Drag or click (${formats} · max. ${maxSizeMb}MB)`}
        </p>
      </div>

      {previewUrl ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-2">
          <img
            src={previewUrl}
            alt=""
            className="size-14 rounded-full object-cover"
            onError={(event) => {
              (event.target as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImagePlus className="size-3 shrink-0" aria-hidden />
              Preview
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={disabled}
            aria-label="Remove new image"
            onClick={(event) => {
              event.stopPropagation();
              onFile(null);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
