import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  className,
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger}
      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 w-auto rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
          role="dialog"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function PopoverTrigger({
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const id = useId();
  return <button type="button" id={id} className={className} {...props} />;
}
