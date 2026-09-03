import { useRef, type ChangeEvent } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AvatarCircleUploadProps {
  id?: string;
  src: string;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  className?: string;
}

/**
 * Avatar circular compacto (100×100) con overlay de cámara al hover.
 */
export function AvatarCircleUpload({
  id = "avatar-circle-upload",
  src,
  disabled,
  onFile,
  className,
}: AvatarCircleUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    onFile(file);
    event.target.value = "";
  }

  return (
    <div className={cn("shrink-0", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Change avatar"
        className={cn(
          "group relative size-[100px] overflow-hidden rounded-full",
          "border-2 border-border bg-muted shadow-sm",
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
            (event.target as HTMLImageElement).src = "/favicon.svg";
          }}
        />
        <span
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1",
            "bg-black/55 text-white opacity-0 transition-opacity duration-200",
            "group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
          aria-hidden
        >
          <Camera className="size-6" />
          <span className="text-[10px] font-medium uppercase tracking-wide">
            Upload
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}
