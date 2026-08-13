import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastBannerProps {
  message: string | null;
  variant?: "error" | "success";
  onDismiss: () => void;
  durationMs?: number;
  className?: string;
}

/** Toast mínimo (éxito / error) sin dependencia extra. */
export function ToastBanner({
  message,
  variant = "error",
  onDismiss,
  durationMs = 6000,
  className,
}: ToastBannerProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const isError = variant === "error";
  const Icon = isError ? XCircle : CheckCircle2;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card px-4 py-3 shadow-lg",
        isError ? "border-red-500/40" : "border-emerald-500/40",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-start gap-2 text-sm",
          isError
            ? "text-red-700 dark:text-red-400"
            : "text-emerald-700 dark:text-emerald-400",
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">{message}</p>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
