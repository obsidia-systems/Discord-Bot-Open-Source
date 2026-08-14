import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  /**
   * Renderiza el contenido en `document.body` con position:fixed
   * para no deformar el layout del padre.
   */
  portalled?: boolean;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  className,
  portalled = false,
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open || !portalled || !rootRef.current) {
      setCoords(null);
      return;
    }
    function place(): void {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 288; // w-72
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = rect.bottom + 8;
      const maxTop = window.innerHeight - 320 - 8; // h-80 approx
      if (top > maxTop) {
        top = Math.max(8, rect.top - 328);
      }
      setCoords({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, portalled, align]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;
      onOpenChange(false);
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

  const panel = open ? (
    <div
      ref={contentRef}
      className={cn(
        "z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none",
        !portalled && "absolute mt-2",
        !portalled && (align === "end" ? "right-0" : "left-0"),
        className,
      )}
      style={
        portalled && coords
          ? { position: "fixed", top: coords.top, left: coords.left }
          : undefined
      }
      role="dialog"
    >
      {children}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger}
      {portalled && typeof document !== "undefined"
        ? panel
          ? createPortal(panel, document.body)
          : null
        : panel}
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
