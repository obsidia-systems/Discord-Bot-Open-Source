import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Tooltip mínimo CSS (hover/focus) sin dependencia extra. */
export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={cn("group/tooltip relative inline-flex max-w-full", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-max max-w-[240px] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
          "group-hover/tooltip:block group-focus-within/tooltip:block",
        )}
      >
        {content}
      </span>
    </span>
  );
}
