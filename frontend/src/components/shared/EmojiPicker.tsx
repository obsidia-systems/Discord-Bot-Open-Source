import { useMemo, useState } from "react";
import { Smile } from "lucide-react";
import type { GuildEmojiAsset } from "@adobos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  emojis: GuildEmojiAsset[];
  onInsert: (mention: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ emojis, onInsert, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emojis.slice(0, 48);
    return emojis
      .filter((emoji) => emoji.name.toLowerCase().includes(q))
      .slice(0, 48);
  }, [emojis, query]);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || emojis.length === 0}
        onClick={() => setOpen((value) => !value)}
      >
        <Smile className="size-4" aria-hidden />
        Server emoji
      </Button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search emoji…"
            className="mb-2 h-8"
          />
          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-xs text-muted-foreground">
              {emojis.length === 0
                ? "No emoji loaded. Check DISCORD_GUILD_ID."
                : "No results."}
            </p>
          ) : (
            <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
              {filtered.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  title={emoji.mention}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md hover:bg-accent",
                  )}
                  onClick={() => {
                    onInsert(emoji.mention);
                    setOpen(false);
                  }}
                >
                  <img src={emoji.url} alt={emoji.name} className="size-6" />
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Inserts the Discord format <code className="font-mono">&lt;:name:id&gt;</code>
          </p>
        </div>
      )}
    </div>
  );
}
