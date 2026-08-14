import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Hash, Search, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ChannelOption {
  id: string;
  name: string;
  type: number;
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

function channelIcon(type: number) {
  // ChannelType.GuildVoice = 2, GuildStageVoice = 13
  if (type === 2 || type === 13) return Volume2;
  return Hash;
}

/** Combobox multi-selección para canales (texto / voz). */
export function ChannelMultiSelect({
  id,
  label,
  placeholder = "Buscar canales…",
  channels,
  value,
  onChange,
  disabled,
  emptyHint = "Sin canales seleccionados.",
}: ChannelMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => channels.filter((ch) => value.includes(ch.id)),
    [channels, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels.slice(0, 50);
    return channels
      .filter(
        (ch) => ch.name.toLowerCase().includes(q) || ch.id.includes(q),
      )
      .slice(0, 50);
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
            return (
              <button
                key={ch.id}
                type="button"
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                onClick={() => toggle(ch.id)}
              >
                <Icon className="size-3 opacity-70" aria-hidden />
                #{ch.name}
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
                Sin resultados.
              </li>
            ) : null}
            {filtered.map((ch) => {
              const checked = value.includes(ch.id);
              const Icon = channelIcon(ch.type);
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
                    <span className="min-w-0 flex-1 truncate font-medium">
                      #{ch.name}
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
