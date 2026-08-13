import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: "right" | "left";
  className?: string;
}

/** Panel lateral deslizante (Sheet) sin dependencia extra. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
  className,
}: SheetProps) {
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

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Cerrar panel"
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 flex h-full w-full max-w-md flex-col border-border bg-card shadow-2xl transition-transform duration-300 ease-out",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          open
            ? "translate-x-0"
            : side === "right"
              ? "translate-x-full"
              : "-translate-x-full",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2 className="font-display text-base font-semibold leading-tight">
              {title}
            </h2>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Cerrar</span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
