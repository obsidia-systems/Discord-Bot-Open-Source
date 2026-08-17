import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Fallback si el runtime no soporta `Intl.supportedValuesOf`. */
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Mexico_City",
  "America/Tijuana",
  "America/Cancun",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Caracas",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Atlantic/Canary",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

export function listIanaTimezones(): string[] {
  try {
    const intlWithSupported = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intlWithSupported.supportedValuesOf === "function") {
      const values = intlWithSupported.supportedValuesOf("timeZone");
      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_TIMEZONES;
}

interface TimezoneComboboxProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

/** Combobox con búsqueda local de zonas IANA. */
export function TimezoneCombobox({
  id = "timezone",
  label = "Zona horaria",
  value,
  onChange,
  disabled,
}: TimezoneComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const zones = useMemo(() => listIanaTimezones(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? zones
      : zones.filter((tz) => tz.toLowerCase().includes(q));
    // Asegura que el valor actual aparezca arriba si coincide
    const prioritized = value
      ? [value, ...list.filter((tz) => tz !== value)]
      : list;
    return prioritized.slice(0, 80);
  }, [zones, query, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-10 w-full justify-between font-normal"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate font-mono text-sm">{value || "UTC"}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              placeholder="Buscar zona (ej. Mexico, Madrid)…"
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                Sin resultados
              </li>
            ) : (
              filtered.map((tz) => (
                <li key={tz}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full rounded-sm px-2 py-1.5 text-left font-mono text-xs transition-colors",
                      tz === value
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted",
                    )}
                    onClick={() => {
                      onChange(tz);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {tz}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
