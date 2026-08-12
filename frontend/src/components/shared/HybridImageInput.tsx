import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, Loader2, Link2, Upload, X } from "lucide-react";
import { uploadImageFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ImageMode = "url" | "upload";

interface HybridImageInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Input híbrido: pegar URL http(s) o subir archivo a `/api/uploads/image`.
 * El valor resultante es URL externa o ruta pública `/uploads/images/...`.
 */
export function HybridImageInput({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder = "https://…",
}: HybridImageInputProps) {
  const [mode, setMode] = useState<ImageMode>(() =>
    value.startsWith("/uploads/") ? "upload" : "url",
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;

      setUploading(true);
      setError(null);
      try {
        const result = await uploadImageFile(file);
        onChange(result.path);
        setMode("upload");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al subir");
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 5 * 1024 * 1024,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    disabled: disabled || uploading,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Tabs>
          <TabsList className="h-8 p-0.5">
            <TabsTrigger
              active={mode === "url"}
              disabled={disabled}
              className="h-7 px-2.5 text-xs"
              onClick={() => setMode("url")}
            >
              <Link2 className="mr-1 size-3.5" aria-hidden />
              URL
            </TabsTrigger>
            <TabsTrigger
              active={mode === "upload"}
              disabled={disabled}
              className="h-7 px-2.5 text-xs"
              onClick={() => setMode("upload")}
            >
              <Upload className="mr-1 size-3.5" aria-hidden />
              Subir
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === "url" ? (
        <Input
          id={id}
          value={value.startsWith("/uploads/") ? "" : value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors",
            isDragActive
              ? "border-primary bg-primary/10"
              : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
            (uploading || disabled) && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} id={id} />
          {uploading ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <Upload className="size-6 text-muted-foreground" aria-hidden />
          )}
          <p className="text-xs font-medium">
            {isDragActive
              ? "Suelta la imagen…"
              : "Arrastra o haz clic (PNG, JPG, WEBP · máx. 5MB)"}
          </p>
        </div>
      )}

      {value.trim() && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-2">
          <img
            src={value}
            alt=""
            className="size-12 rounded object-cover"
            onError={(event) => {
              (event.target as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImagePlus className="size-3 shrink-0" aria-hidden />
              Vista previa
            </p>
            <p className="truncate font-mono text-[11px] text-foreground/80">
              {value}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={disabled}
            aria-label="Quitar imagen"
            onClick={() => onChange("")}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
