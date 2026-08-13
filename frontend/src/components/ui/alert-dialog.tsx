import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AlertDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  tone?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmación compacto (estilo AlertDialog). */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirming = false,
  tone = "default",
  onConfirm,
  onCancel,
}: AlertDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60"
        disabled={confirming}
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-desc"
        className={cn(
          "relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl",
        )}
      >
        <h2
          id="alert-dialog-title"
          className="font-display text-base font-semibold"
        >
          {title}
        </h2>
        <div
          id="alert-dialog-desc"
          className="mt-2 text-sm text-muted-foreground"
        >
          {description}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={confirming}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
