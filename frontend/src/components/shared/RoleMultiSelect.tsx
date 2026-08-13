import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface RoleOption {
  id: string;
  name: string;
  color?: number | null;
}

interface RoleMultiSelectProps {
  id?: string;
  label: string;
  placeholder?: string;
  roles: RoleOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}

function roleSwatch(color?: number | null): string {
  if (!color || color === 0) return "#99aab5";
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Combobox multi-selección con búsqueda local (roles del servidor). */
export function RoleMultiSelect({
  id,
  label,
  placeholder = "Buscar roles…",
  roles,
  value,
  onChange,
  disabled,
  emptyHint = "Sin roles seleccionados.",
}: RoleMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => roles.filter((role) => value.includes(role.id)),
    [roles, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles.slice(0, 40);
    return roles
      .filter(
        (role) =>
          role.name.toLowerCase().includes(q) || role.id.includes(q),
      )
      .slice(0, 40);
  }, [roles, query]);

  function toggle(roleId: string): void {
    if (value.includes(roleId)) {
      onChange(value.filter((id) => id !== roleId));
      return;
    }
    onChange([...value, roleId]);
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((role) => (
            <button
              key={role.id}
              type="button"
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
              onClick={() => toggle(role.id)}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: roleSwatch(role.color) }}
                aria-hidden
              />
              @{role.name}
              <X className="size-3 opacity-60" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-10 w-full justify-between font-normal"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate text-muted-foreground">{placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              id={id}
              value={query}
              autoFocus
              disabled={disabled}
              placeholder={placeholder}
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                Sin resultados.
              </li>
            ) : null}
            {filtered.map((role) => {
              const checked = value.includes(role.id);
              return (
                <li key={role.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                      checked && "bg-accent",
                    )}
                    onClick={() => toggle(role.id)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: roleSwatch(role.color) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      @{role.name}
                    </span>
                    {checked ? (
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
