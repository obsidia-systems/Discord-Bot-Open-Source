import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Contenedor con scroll nativo (equivalente ligero a Shadcn ScrollArea).
 * Usa overflow controlado para no pelear con Popover/Dialog flotantes.
 */
export function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <div className={cn("relative overflow-hidden", className)} {...props}>
      <div className="h-full w-full overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
