import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accordion simple (un ítem abierto a la vez) sin dependencia Radix. */
export function Accordion({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-3", className)} {...props} />;
}

export function AccordionItem({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  open,
  children,
  subtitle,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  open?: boolean;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
        className,
      )}
      aria-expanded={open}
      {...props}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          {children}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      <ChevronDown
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}

export function AccordionContent({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className={cn("border-t border-border px-4 py-4", className)}>
      {children}
    </div>
  );
}
