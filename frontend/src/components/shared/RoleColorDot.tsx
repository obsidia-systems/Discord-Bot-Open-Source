import { cn } from "@/lib/utils";

/** Gris Discord para roles sin color (#000000 / 0). */
export const ROLE_DOT_FALLBACK = "#B5BAC1";

/**
 * Resuelve el color del punto: acepta hex (`#rrggbb`), entero Discord o null.
 * `#000000` / `0` → gris sutil para no perderse en fondo oscuro.
 */
export function resolveRoleDotColor(
  color?: string | number | null,
): string {
  if (color == null || color === "") return ROLE_DOT_FALLBACK;

  if (typeof color === "number") {
    if (color === 0) return ROLE_DOT_FALLBACK;
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  const hex = color.trim().toLowerCase();
  if (
    hex === "#000000" ||
    hex === "000000" ||
    hex === "#000" ||
    hex === "0"
  ) {
    return ROLE_DOT_FALLBACK;
  }

  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  if (/^\d+$/.test(hex)) {
    const n = Number.parseInt(hex, 10);
    if (n === 0) return ROLE_DOT_FALLBACK;
    return `#${n.toString(16).padStart(6, "0")}`;
  }

  return ROLE_DOT_FALLBACK;
}

interface RoleColorDotProps {
  color?: string | number | null;
  className?: string;
}

/** Círculo de color estilo Discord junto al nombre del rol. */
export function RoleColorDot({ color, className }: RoleColorDotProps) {
  return (
    <span
      className={cn("inline-block size-3 shrink-0 rounded-full", className)}
      style={{ backgroundColor: resolveRoleDotColor(color) }}
      aria-hidden
    />
  );
}

interface RoleColorBadgeProps {
  name: string;
  color?: string | number | null;
  /** Prefijo visual (+ / −) fuera del chip. */
  sign?: "+" | "−" | "-";
  signTone?: "add" | "remove";
  className?: string;
  showAt?: boolean;
}

/** Chip sutil con punto de color + nombre (estética nativa Discord). */
export function RoleColorBadge({
  name,
  color,
  sign,
  signTone,
  className,
  showAt = false,
}: RoleColorBadgeProps) {
  const signChar = sign === "-" ? "−" : sign;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {signChar ? (
        <span
          className={cn(
            "text-xs font-semibold",
            signTone === "add" && "text-emerald-500",
            signTone === "remove" && "text-rose-500",
            !signTone && "text-muted-foreground",
          )}
          aria-hidden
        >
          {signChar}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1 text-xs font-medium text-foreground">
        <RoleColorDot color={color} />
        <span className="truncate">
          {showAt ? `@${name}` : name}
        </span>
      </span>
    </span>
  );
}
