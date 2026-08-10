import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utilidad shadcn: combina clases Tailwind sin conflictos. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
