import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "relative flex size-7 shrink-0 overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function AvatarImage({
  className,
  alt = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (!props.src || failed) return null;
  return (
    <img
      alt={alt}
      className={cn(
        "absolute inset-0 aspect-square size-full object-cover",
        className,
      )}
      onError={() => setFailed(true)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-full items-center justify-center bg-muted text-[10px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Iniciales a partir de un displayName (máx. 2 caracteres). */
export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
