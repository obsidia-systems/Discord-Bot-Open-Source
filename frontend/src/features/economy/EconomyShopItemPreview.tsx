import type { EconomyShopItem } from "@adobos/shared";
import {
  ECONOMY_SHOP_REWARD_LABELS,
  type EconomyShopRewardType,
} from "@adobos/shared";
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
  const s = icon.trim() || "🛒";
  if (isImageIcon(s)) {
    return (
      <img
        src={resolvePublicAssetUrl(s)}
        alt=""
        className="inline-block size-5 object-contain align-middle"
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
        className="inline-block size-5 object-contain align-middle"
      />
    );
  }
  return <span className="text-base leading-none">{s}</span>;
}

export function EconomyShopItemPreview({
  item,
  currencyName,
  className,
}: {
  item: Pick<
    EconomyShopItem,
    "name" | "description" | "price" | "icon" | "stock" | "rewardType"
  >;
  currencyName: string;
  className?: string;
}) {
  const stockLabel = item.stock === null ? "∞" : String(item.stock);
  const typeLabel =
    ECONOMY_SHOP_REWARD_LABELS[item.rewardType as EconomyShopRewardType] ??
    item.rewardType;

  return (
    <div className={cn(className)}>
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
              <div className="grid grid-cols-3 gap-2 text-xs">
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
                <div>
                  <p className="font-semibold text-white">Tipo</p>
                  <p>{typeLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DiscordShell>
    </div>
  );
}
