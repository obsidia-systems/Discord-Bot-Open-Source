import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Oculta cabecera (útil para pickers compactos). */
  hideHeader?: boolean;
}

/** Modal centrado sin dependencia extra (mismo patrón que Sheet). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideHeader = false,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl",
          className,
        )}
      >
        {!hideHeader ? (
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              {title ? (
                <h2 className="text-sm font-semibold leading-tight">{title}</h2>
              ) : null}
              {description ? (
                <p className="text-xs text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </header>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 size-7"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
