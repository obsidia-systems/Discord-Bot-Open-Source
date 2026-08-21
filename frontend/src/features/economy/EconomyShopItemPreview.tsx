import type { EconomyShopItem, EconomyShopRewards } from "@adobos/shared";
import { summarizeShopRewards } from "@adobos/shared";
import { resolvePublicAssetUrl } from "@/lib/api";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const BOT_NAME = "Adobos Bot";
const MOCK_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
const ACCENT = "#e11d48";

function isImageIcon(icon: string): boolean {
  const s = icon.trim();
  return (
    s.startsWith("/uploads/") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

export function ShopItemIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const s = icon.trim() || "🛒";
  if (isImageIcon(s)) {
    return (
      <img
        src={resolvePublicAssetUrl(s)}
        alt=""
        className={cn(
          "inline-block size-5 object-contain align-middle",
          className,
        )}
      />
    );
  }
  const mention = /^<(a)?:([\w~]+):(\d+)>$/.exec(s);
  if (mention) {
    const animated = Boolean(mention[1]);
    const id = mention[3]!;
    return (
      <img
        src={`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=32`}
        alt=""
        className={cn(
          "inline-block size-5 object-contain align-middle",
          className,
        )}
      />
    );
  }
  return (
    <span className={cn("text-base leading-none", className)}>{s}</span>
  );
}

function DiscordShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md bg-[#313338] p-3 text-[13px] text-[#dbdee1] shadow-sm">
      <div className="flex gap-3">
        <img
          src={MOCK_AVATAR}
          alt=""
          className="size-10 shrink-0 rounded-full"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-white">{BOT_NAME}</span>
            <span className="rounded bg-[#5865F2] px-1 py-px text-[10px] font-semibold uppercase leading-none text-white">
              App
            </span>
            <span className="text-[11px] text-[#949ba4]">Hoy a las 12:00</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function IconMark({ icon }: { icon: string }) {
  return <ShopItemIcon icon={icon} />;
}

export function EconomyShopItemPreview({
  item,
  currencyName,
  className,
}: {
  item: Pick<
    EconomyShopItem,
    "name" | "description" | "price" | "icon" | "stock"
  > & { rewards: EconomyShopRewards };
  currencyName: string;
  className?: string;
}) {
  const stockLabel = item.stock === null ? "∞" : String(item.stock);
  const summary = summarizeShopRewards(item.rewards);

  return (
    <div className={cn("space-y-3", className)}>
      <DiscordShell>
        <p className="text-[#dbdee1]">
          @UsuarioDePrueba usó{" "}
          <span className="text-[#00a8fc]">/shop</span>
        </p>
        <div className="mt-1 overflow-hidden rounded-sm bg-[#2b2d31]">
          <div className="flex">
            <div
              className="w-1 shrink-0 self-stretch"
              style={{ backgroundColor: ACCENT }}
            />
            <div className="min-w-0 flex-1 space-y-2 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <IconMark icon={item.icon} />
                {item.name || "Nombre del ítem"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
                {item.description || "Sin descripción."}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="font-semibold text-white">Precio</p>
                  <p>
                    {item.price.toLocaleString("es-MX")}{" "}
                    {currencyName || "monedas"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-white">Stock</p>
                  <p>{stockLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DiscordShell>

      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Beneficios
        </p>
        {summary.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Activa al menos una recompensa.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-xs text-foreground">
            {summary.map((line, i) => (
              <li key={`${line}-${i}`}>• {line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
