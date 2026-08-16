import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";

export interface AsyncSelectOption {
  id: string;
  label: string;
  description?: string;
  /** Línea terciaria compacta (p. ej. snowflake). */
  meta?: string;
  avatarUrl?: string;
}

interface AsyncSearchSelectProps {
  id?: string;
  label: string;
  placeholder?: string;
  value: AsyncSelectOption | null;
  onChange: (next: AsyncSelectOption | null) => void;
  onSearch: (query: string) => Promise<AsyncSelectOption[]>;
  /** Por defecto 300ms para no saturar el backend. */
  debounceMs?: number;
  /**
   * Caracteres mínimos antes de buscar.
   * Con `0`, query vacía puede devolver sugerencias (p. ej. miembros recientes).
   */
  minQueryLength?: number;
  disabled?: boolean;
  emptyHint?: string;
}

/**
 * Combobox asíncrono con debounce para no saturar la API.
 */
export function AsyncSearchSelect({
  id: idProp,
  label,
  placeholder = "Buscar…",
  value,
  onChange,
  onSearch,
  debounceMs = 300,
  minQueryLength = 0,
  disabled,
  emptyHint,
}: AsyncSearchSelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AsyncSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < minQueryLength) {
      setOptions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void onSearch(q)
        .then((hits) => {
          if (cancelled) return;
          setOptions(hits);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setOptions([]);
          setError(err instanceof Error ? err.message : "Error de búsqueda");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, onSearch, debounceMs, minQueryLength]);

  const showNeedChars =
    !error && !loading && query.trim().length < minQueryLength;
  const showEmpty =
    !error &&
    !loading &&
    query.trim().length >= minQueryLength &&
    options.length === 0;

  return (
    <div ref={rootRef} className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 min-w-0 flex-1 justify-between font-normal"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {value && value.avatarUrl !== undefined ? (
              <UserAvatar
                src={value.avatarUrl}
                name={value.label}
                className="size-5 ring-0"
              />
            ) : null}
            <span className="truncate">
              {value ? value.label : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            disabled={disabled}
            aria-label="Limpiar selección"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={id}
              value={query}
              autoFocus
              disabled={disabled}
              placeholder={placeholder}
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
            />
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <ul className="max-h-[300px] overflow-y-auto overscroll-contain p-1">
            {error ? (
              <li className="px-2 py-3 text-xs text-red-600 dark:text-red-400">
                {error}
              </li>
            ) : null}
            {showNeedChars ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                {emptyHint ??
                  (minQueryLength > 0
                    ? `Escribe al menos ${minQueryLength} carácter(es)…`
                    : "Escribe un nombre o ID…")}
              </li>
            ) : null}
            {showEmpty ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                Sin resultados.
              </li>
            ) : null}
            {options.map((option) => {
              const selected = value?.id === option.id;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      selected && "bg-accent",
                    )}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {option.avatarUrl !== undefined ? (
                      <UserAvatar
                        src={option.avatarUrl}
                        name={option.label}
                        className="size-7"
                      />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">
                        #
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="block truncate text-xs leading-tight text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                      {option.meta ? (
                        <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground/80">
                          {option.meta}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
