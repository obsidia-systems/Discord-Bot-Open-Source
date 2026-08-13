import { useRef, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface BackgroundImageUploadProps {
  id?: string;
  label?: string;
  src: string;
  disabled?: boolean;
  uploading?: boolean;
  onFile: (file: File) => void;
  className?: string;
}

/**
 * Uploader compacto de fondo (preview real vive en Vista previa).
 */
export function BackgroundImageUpload({
  id = "background-image-upload",
  label = "Fondo",
  src,
  disabled,
  uploading,
  onFile,
  className,
}: BackgroundImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = Boolean(disabled || uploading);

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <button
        type="button"
        disabled={busy}
        aria-label="Cambiar fondo"
        className={cn(
          "group relative h-28 w-full overflow-hidden rounded-lg border-2 border-border bg-muted shadow-sm sm:h-32",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-60",
        )}
        onClick={() => inputRef.current?.click()}
      >
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={(event) => {
            (event.target as HTMLImageElement).style.opacity = "0.35";
          }}
        />
        <span
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1",
            "bg-black/55 text-white opacity-0 transition-opacity duration-200",
            "group-hover:opacity-100 group-focus-visible:opacity-100",
            uploading && "opacity-100",
          )}
          aria-hidden
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Upload className="size-5" />
          )}
          <span className="text-[11px] font-medium tracking-wide">
            {uploading ? "Subiendo…" : "Cambiar fondo"}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="sr-only"
        disabled={busy}
        onChange={onChange}
      />
      <p className="text-[11px] text-muted-foreground">
        PNG, JPG o WEBP · máx. 5MB
      </p>
    </div>
  );
}
