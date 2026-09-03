import { useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Definición agnóstica de una variable de plantilla. */
export interface VariableDefinition {
  /** Token copiable, p. ej. `{user}`. */
  token: string;
  /** Descripción corta para el usuario. */
  tip: string;
}

export interface VariableItemCardProps {
  item: VariableDefinition;
  className?: string;
  onCopied?: (token: string) => void;
}

/**
 * Tarjeta individual de variable (estilo bienvenidas):
 * token magenta mono + tip debajo, borde sutil, clic para copiar.
 */
export function VariableItemCard({
  item,
  className,
  onCopied,
}: VariableItemCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.token);
      setCopied(true);
      onCopied?.(item.token);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={`Copy ${item.token}`}
      className={cn(
        "w-full rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-left transition-colors",
        "hover:border-primary/30 hover:bg-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <code className="font-mono text-xs font-medium text-primary">
        {item.token}
      </code>
      <span className="mt-1 block text-xs text-muted-foreground">
        {copied ? "Copied" : item.tip}
      </span>
    </button>
  );
}

export interface VariableListBaseProps {
  items: readonly VariableDefinition[];
  title?: string;
  description?: string;
  className?: string;
  /** Contenido extra debajo de la lista (slot opcional). */
  children?: ReactNode;
}

/**
 * Contenedor base para listas de variables de plantilla.
 * Diseño unificado (tarjetas) para embeds, bienvenidas y futuros módulos.
 */
export function VariableListBase({
  items,
  title = "Variables",
  description = "Click to copy.",
  className,
  children,
}: VariableListBaseProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.map((item) => (
          <VariableItemCard key={item.token} item={item} />
        ))}
        {children}
      </CardContent>
    </Card>
  );
}
