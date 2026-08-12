import { useEffect, useMemo, useState } from "react";
import EmojiPickerReact, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from "emoji-picker-react";
import { Smile } from "lucide-react";
import type { GuildEmojiAsset } from "@adobos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface DiscordEmojiSelection {
  /** Clave interna para SQLite / reacciones: `unicode:…` o `custom:…` */
  emojiKey: string;
  /** Representación visual (unicode o mention Discord) */
  display: string;
  /** Mention Discord si es custom */
  mention?: string;
  /** URL de preview (custom) */
  imageUrl?: string;
}

interface DiscordEmojiPickerProps {
  serverEmojis: GuildEmojiAsset[];
  value?: DiscordEmojiSelection | null;
  onSelect: (selection: DiscordEmojiSelection) => void;
  disabled?: boolean;
  /** Clase del botón trigger */
  className?: string;
}

export function DiscordEmojiPicker({
  serverEmojis,
  value,
  onSelect,
  disabled,
  className,
}: DiscordEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"native" | "server">("native");
  const [query, setQuery] = useState("");
  const [pickerTheme, setPickerTheme] = useState<Theme>(Theme.LIGHT);

  useEffect(() => {
    function syncTheme(): void {
      setPickerTheme(
        document.documentElement.classList.contains("dark")
          ? Theme.DARK
          : Theme.LIGHT,
      );
    }
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const filteredServer = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return serverEmojis;
    return serverEmojis.filter((emoji) => emoji.name.toLowerCase().includes(q));
  }, [serverEmojis, query]);

  function handleNative(emoji: EmojiClickData): void {
    onSelect({
      emojiKey: `unicode:${emoji.emoji}`,
      display: emoji.emoji,
    });
    setOpen(false);
  }

  function handleServer(emoji: GuildEmojiAsset): void {
    onSelect({
      emojiKey: `custom:${emoji.id}`,
      display: emoji.mention,
      mention: emoji.mention,
      imageUrl: emoji.url,
    });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-[320px] overflow-hidden p-0"
      trigger={
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("min-w-28 justify-start gap-2", className)}
          onClick={() => setOpen((prev) => !prev)}
        >
          {value?.imageUrl ? (
            <img src={value.imageUrl} alt="" className="size-5" />
          ) : value?.display && !value.display.startsWith("<") ? (
            <span className="text-base leading-none">{value.display}</span>
          ) : (
            <Smile className="size-4" aria-hidden />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {value ? "Cambiar" : "Elegir emoji"}
          </span>
        </Button>
      }
    >
      <div className="p-2">
        <Tabs>
          <TabsList className="w-full">
            <TabsTrigger
              className="flex-1"
              active={tab === "native"}
              onClick={() => setTab("native")}
            >
              Nativos
            </TabsTrigger>
            <TabsTrigger
              className="flex-1"
              active={tab === "server"}
              onClick={() => setTab("server")}
            >
              Del servidor
            </TabsTrigger>
          </TabsList>

          {tab === "native" ? (
            <TabsContent className="mt-2">
              <EmojiPickerReact
                onEmojiClick={handleNative}
                theme={pickerTheme}
                emojiStyle={EmojiStyle.NATIVE}
                width="100%"
                height={320}
                previewConfig={{ showPreview: false }}
                searchPlaceHolder="Buscar emoji…"
              />
            </TabsContent>
          ) : (
            <TabsContent className="mt-2 space-y-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar del servidor…"
                className="h-8"
              />
              {filteredServer.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  {serverEmojis.length === 0
                    ? "No hay emojis del servidor cargados."
                    : "Sin resultados."}
                </p>
              ) : (
                <div className="grid max-h-72 grid-cols-6 gap-1 overflow-y-auto p-1">
                  {filteredServer.map((emoji) => (
                    <button
                      key={emoji.id}
                      type="button"
                      title={emoji.mention}
                      className="flex size-10 items-center justify-center rounded-md hover:bg-accent"
                      onClick={() => handleServer(emoji)}
                    >
                      <img src={emoji.url} alt={emoji.name} className="size-7" />
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Popover>
  );
}
