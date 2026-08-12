import { useId, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavCategoryGroupProps {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Si true, el grupo permanece siempre abierto (sin toggle ni chevron). */
  staticOpen?: boolean;
  /** Controlado por el padre (acordeón). Ignorado si `staticOpen`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Grupo de categoría del sidebar.
 * Animación de altura vía `grid-rows-[0fr|1fr]` (evita saltos de `height: auto`).
 */
export function NavCategoryGroup({
  id,
  label,
  icon: Icon,
  staticOpen = false,
  open = false,
  onOpenChange,
  children,
}: NavCategoryGroupProps) {
  const panelId = useId();
  const isOpen = staticOpen || open;

  function handleToggle(): void {
    if (staticOpen) return;
    onOpenChange?.(!open);
  }

  return (
    <div className="space-y-1" data-nav-category={id}>
      {staticOpen ? (
        <div className="flex w-full items-center gap-2 px-2 py-1.5 text-muted-foreground">
          <Icon className="size-3.5 shrink-0 text-primary/80" aria-hidden />
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
            {label}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
            "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={handleToggle}
        >
          <Icon className="size-3.5 shrink-0 text-primary/80" aria-hidden />
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
            {label}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-300 ease-in-out",
              !isOpen && "-rotate-90",
            )}
            aria-hidden
          />
        </button>
      )}

      <div
        id={panelId}
        role="region"
        aria-label={label}
        aria-hidden={!isOpen}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul
            className={cn(
              "space-y-0.5",
              !isOpen && "pointer-events-none",
            )}
          >
            {children}
          </ul>
        </div>
      </div>
    </div>
  );
}
