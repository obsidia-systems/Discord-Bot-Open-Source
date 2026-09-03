import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Folder,
  Hash,
  Search,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ChannelOption {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
}

interface ChannelMultiSelectProps {
  id?: string;
  label: string;
  placeholder?: string;
  channels: ChannelOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}

const CATEGORY_TYPE = 4;

function channelIcon(type: number) {
  if (type === CATEGORY_TYPE) return Folder;
  if (type === 2 || type === 13) return Volume2;
  return Hash;
}

function isCategory(type: number): boolean {
  return type === CATEGORY_TYPE;
}

/** Combobox multi-selección para canales, voz y categorías de Discord. */
export function ChannelMultiSelect({
  id,
  label,
  placeholder = "Search channels…",
  channels,
  value,
  onChange,
  disabled,
  emptyHint = "No channels selected.",
}: ChannelMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent): void {
      const root = rootRef.current;
      const target = event.target;
      if (!(target instanceof Node) || !root) return;
      if (!root.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const childCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const ch of channels) {
      if (ch.parentId && !isCategory(ch.type)) {
        map.set(ch.parentId, (map.get(ch.parentId) ?? 0) + 1);
      }
    }
    return map;
  }, [channels]);

  const selected = useMemo(
    () => channels.filter((ch) => value.includes(ch.id)),
    [channels, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...channels].sort((a, b) => {
      // Categorías primero, luego por nombre
      const ac = isCategory(a.type) ? 0 : 1;
      const bc = isCategory(b.type) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.name.localeCompare(b.name);
    });
    if (!q) return list.slice(0, 60);
    return list
      .filter(
        (ch) => ch.name.toLowerCase().includes(q) || ch.id.includes(q),
      )
      .slice(0, 60);
  }, [channels, query]);

  function toggle(channelId: string): void {
    if (value.includes(channelId)) {
      onChange(value.filter((id) => id !== channelId));
      return;
    }
    onChange([...value, channelId]);
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((ch) => {
            const Icon = channelIcon(ch.type);
            const category = isCategory(ch.type);
            const kids = childCountByCategory.get(ch.id) ?? 0;
            return (
              <button
                key={ch.id}
                type="button"
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  category
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border bg-muted/40",
                )}
                onClick={() => toggle(ch.id)}
                title={
                  category
                    ? `Category · also ignores ${kids} child channel(s)`
                    : undefined
                }
              >
                <Icon className="size-3 opacity-70" aria-hidden />
                {category ? ch.name : `#${ch.name}`}
                {category ? (
                  <span className="text-[10px] text-muted-foreground">
                    +children
                  </span>
                ) : null}
                <X className="size-3 opacity-60" aria-hidden />
              </button>
            );
          })}
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
                No results.
              </li>
            ) : null}
            {filtered.map((ch) => {
              const checked = value.includes(ch.id);
              const Icon = channelIcon(ch.type);
              const category = isCategory(ch.type);
              const kids = childCountByCategory.get(ch.id) ?? 0;
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                      checked && "bg-accent",
                    )}
                    onClick={() => toggle(ch.id)}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {category ? ch.name : `#${ch.name}`}
                      </span>
                      {category ? (
                        <span className="block text-[11px] text-muted-foreground">
                          Category · also ignores {kids} child channel(s)
                        </span>
                      ) : null}
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
