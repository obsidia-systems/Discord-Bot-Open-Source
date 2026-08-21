import { useMemo, useState } from "react";
import { Smile } from "lucide-react";
import EmojiPicker, {
  Theme,
  type EmojiClickData,
} from "emoji-picker-react";
import type { GuildEmojiAsset } from "@adobos/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface DiscordEmojiSelection {
  /** Clave interna: `unicode:…` o `custom:…` */
  emojiKey: string;
  display: string;
  mention?: string;
  imageUrl?: string;
}

interface DiscordEmojiPickerProps {
  serverEmojis: GuildEmojiAsset[];
  value?: DiscordEmojiSelection | null;
  onSelect: (selection: DiscordEmojiSelection) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Selector de emojis: Dialog + emoji-picker-react (categorías nativas)
 * y customEmojis del servidor. El scroll lo maneja la librería (p-0).
 */
export function DiscordEmojiPicker({
  serverEmojis,
  value,
  onSelect,
  disabled,
  className,
}: DiscordEmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const customEmojis = useMemo(
    () =>
      serverEmojis.map((emoji) => ({
        id: emoji.id,
        names: [emoji.name, emoji.mention],
        imgUrl: emoji.url,
      })),
    [serverEmojis],
  );

  function handleEmojiClick(data: EmojiClickData): void {
    if (data.isCustom) {
      const match =
        serverEmojis.find((e) => e.id === data.unified) ??
        serverEmojis.find((e) => e.url === data.imageUrl) ??
        serverEmojis.find((e) => data.names.includes(e.name));
      if (match) {
        onSelect({
          emojiKey: `custom:${match.id}`,
          display: match.mention,
          mention: match.mention,
          imageUrl: match.url,
        });
      } else {
        onSelect({
          emojiKey: `custom:${data.unified}`,
          display: data.emoji || data.names[0] || data.unified,
          imageUrl: data.imageUrl,
        });
      }
    } else {
      onSelect({
        emojiKey: `unicode:${data.emoji}`,
        display: data.emoji,
      });
    }
    setOpen(false);
  }

  const mentionMatch = value?.mention
    ? /^<(a)?:([\w~]+):(\d+)>$/.exec(value.mention)
    : null;
  const mentionCdn = mentionMatch
    ? `https://cdn.discordapp.com/emojis/${mentionMatch[3]}.${mentionMatch[1] === "a" ? "gif" : "png"}?size=32`
    : null;
  const buttonImage = value?.imageUrl || mentionCdn;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        className={cn("size-9 shrink-0", className)}
        aria-label={value ? "Cambiar emoji" : "Elegir emoji"}
        onClick={() => setOpen(true)}
      >
        {buttonImage ? (
          <img src={buttonImage} alt="" className="size-5" />
        ) : value?.display && !value.display.startsWith("<") ? (
          <span className="text-base leading-none">{value.display}</span>
        ) : (
          <Smile className="size-4" aria-hidden />
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Elegir emoji"
        description="Nativos o del servidor"
        className="w-auto max-w-[min(100vw-2rem,360px)] overflow-hidden p-0"
      >
        <div className="overflow-hidden [&_.EmojiPickerReact]:!border-0">
          <EmojiPicker
            theme={Theme.DARK}
            width={350}
            height={400}
            searchPlaceHolder="Buscar emoji…"
            previewConfig={{ showPreview: false }}
            lazyLoadEmojis
            customEmojis={customEmojis}
            onEmojiClick={handleEmojiClick}
          />
        </div>
      </Dialog>
    </>
  );
}
