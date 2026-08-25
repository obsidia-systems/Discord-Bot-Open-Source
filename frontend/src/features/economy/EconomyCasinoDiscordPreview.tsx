import type { EconomyCasinoConfig } from "@adobos/shared";
import { applyEconomyMessageTemplate } from "@adobos/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MOCK_USER = "@UsuarioDePrueba";
const MOCK_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
const BOT_NAME = "Adobos Bot";
const ACCENT = "#e11d48";
const SUCCESS = "#57F287";

export type EconomyCasinoSimulatorTab =
  | "global"
  | "coinflip"
  | "roulette"
  | "blackjack";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

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

/** Mini-carta que simula un App Emoji de Discord en el embed. */
function AppEmojiCard({
  rank,
  suit,
  faceDown,
}: {
  rank?: string;
  suit?: Suit;
  faceDown?: boolean;
}) {
  if (faceDown) {
    return (
      <span
        title="Carta oculta"
        className="inline-flex h-9 w-7 shrink-0 flex-col items-center justify-center rounded-[4px] border border-[#1e3a5f] bg-[linear-gradient(145deg,#1e3a8a_0%,#312e81_55%,#1e3a8a_100%)] shadow-sm"
        aria-hidden
      >
        <span className="text-[10px] font-bold text-white/80">?</span>
      </span>
    );
  }

  const red = suit === "hearts" || suit === "diamonds";
  return (
    <span
      title={`${rank}${suit ? SUIT_GLYPH[suit] : ""}`}
      className={cn(
        "inline-flex h-9 w-7 shrink-0 flex-col items-center justify-between rounded-[4px] border border-black/10 bg-white px-0.5 py-0.5 shadow-sm",
        red ? "text-[#dc2626]" : "text-[#111827]",
      )}
      aria-hidden
    >
      <span className="text-[9px] font-bold leading-none">{rank}</span>
      <span className="text-[11px] leading-none">
        {suit ? SUIT_GLYPH[suit] : ""}
      </span>
    </span>
  );
}

function BlackjackHandPreview() {
  return (
    <div className="space-y-2.5 pt-1">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#949ba4]">
          Tú · 21
        </p>
        <div className="flex gap-1">
          <AppEmojiCard rank="A" suit="spades" />
          <AppEmojiCard rank="10" suit="hearts" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#949ba4]">
          Crupier
        </p>
        <div className="flex gap-1">
          <AppEmojiCard rank="K" suit="clubs" />
          <AppEmojiCard faceDown />
        </div>
      </div>
      <p className="text-[10px] text-[#949ba4]">
        Vista previa con App Emojis (cartas como imágenes en Discord).
      </p>
    </div>
  );
}

function Embed({
  color,
  title,
  description,
  buttons,
  children,
}: {
  color: string;
  title: string;
  description: string;
  buttons?: string[];
  children?: ReactNode;
}) {
  return (
    <div className="mt-1 space-y-2">
      <div className="overflow-hidden rounded-sm bg-[#2b2d31]">
        <div className="flex">
          <div
            className="w-1 shrink-0 self-stretch"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1 space-y-1 p-3">
            <p className="text-sm font-semibold text-white">{title}</p>
            {description ? (
              <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
                {description}
              </p>
            ) : null}
            {children}
          </div>
        </div>
      </div>
      {buttons && buttons.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {buttons.map((label) => (
            <span
              key={label}
              className="rounded bg-[#4e5058] px-2.5 py-1 text-xs font-medium text-white"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MOCK_HISTORY = [17, 0, 32, 8, 21] as const;

function historyChipColor(n: number): string {
  if (n === 0) return "bg-[#16a34a] text-white";
  const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  return reds.has(n) ? "bg-[#dc2626] text-white" : "bg-[#1f2937] text-white";
}

export function EconomyCasinoDiscordPreview({
  config,
  currencyName,
  tab,
  className,
}: {
  config: EconomyCasinoConfig;
  currencyName: string;
  tab: EconomyCasinoSimulatorTab;
  className?: string;
}) {
  const currency = currencyName || "monedas";
  const sampleBet = Math.max(
    config.minBet,
    Math.min(
      config.maxBet,
      Math.round((config.minBet + config.maxBet) / 4) || 100,
    ),
  );

  let command = "/coinflip";
  let title = "Casino";
  let description = "";
  let color = ACCENT;
  let buttons: string[] | undefined;
  let extra: ReactNode = null;

  if (!config.isActive) {
    command = "/coinflip";
    title = "Casino cerrado";
    description =
      "⛔ El casino está desactivado en este servidor.\nActívalo en la pestaña General.";
    color = "#ed4245";
  } else if (tab === "global") {
    command = "/coinflip";
    title = "Límites de apuesta";
    description = [
      `Apuesta mínima: **${config.minBet.toLocaleString("es-MX")}** ${currency}`,
      `Apuesta máxima: **${config.maxBet.toLocaleString("es-MX")}** ${currency}`,
      "",
      "Usa `/coinflip`, `/roulette` o `/blackjack`.",
    ].join("\n");
    color = ACCENT;
  } else if (tab === "coinflip") {
    command = "/coinflip";
    const payout = Math.floor(sampleBet * config.coinflip.multiplier);
    title = "Coinflip — ¡Ganaste!";
    description = applyEconomyMessageTemplate(config.coinflip.winMessage, {
      side: "Cara",
      payout: payout.toLocaleString("es-MX"),
      currency,
    });
    description += [
      "",
      `Apuesta: **${sampleBet.toLocaleString("es-MX")}** · x${config.coinflip.multiplier}`,
      `Doble o Nada: **${config.coinflip.allowDoubleOrNothing ? "Disponible" : "Desactivado"}**`,
      `Cooldown: **${config.coinflip.cooldownSeconds}s**`,
    ].join("\n");
    color = SUCCESS;
    buttons = config.coinflip.allowDoubleOrNothing
      ? ["🪙 Cara", "🌑 Cruz", "⚡ Doble o Nada"]
      : ["🪙 Cara", "🌑 Cruz"];
  } else if (tab === "roulette") {
    command = "/roulette";
    title = "Ruleta";
    description = [
      `Apuesta de ejemplo: **${sampleBet.toLocaleString("es-MX")}** ${currency}`,
      `Ventana de apuestas: **${config.roulette.bettingTimeSeconds}s**`,
      "",
      `🔴/⚫ Color → **x${config.roulette.colorMultiplier}**`,
      `🟢 Verde → **x${config.roulette.greenMultiplier}**`,
      `🔢 Número exacto → **x${config.roulette.numberMultiplier}**`,
    ].join("\n");
    color = ACCENT;
    buttons = ["Rojo", "Negro", "Verde", "Número"];
    if (config.roulette.showNumberHistory) {
      extra = (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#949ba4]">
            Últimos 5
          </p>
          <div className="flex gap-1">
            {MOCK_HISTORY.map((n) => (
              <span
                key={n}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-[10px] font-bold",
                  historyChipColor(n),
                )}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      );
    }
  } else {
    command = "/blackjack";
    title = "Blackjack";
    description = [
      `Apuesta: **${sampleBet.toLocaleString("es-MX")}** ${currency}`,
      `Blackjack natural → **x${config.blackjack.blackjackMultiplier}**`,
      `Barajas: **${config.blackjack.deckCount}** · Soft 17: **${config.blackjack.standOnSoft17 ? "Planta" : "Pide"}**`,
      `Doblar: **${config.blackjack.allowDoubleDown ? "Permitido" : "No permitido"}**`,
    ].join("\n");
    color = SUCCESS;
    buttons = config.blackjack.allowDoubleDown
      ? ["Pedir", "Plantarse", "Doblar"]
      : ["Pedir", "Plantarse"];
    extra = <BlackjackHandPreview />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <DiscordShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} usó <span className="text-[#00a8fc]">{command}</span>
        </p>
        <Embed
          color={color}
          title={title}
          description={description}
          buttons={buttons}
        >
          {extra}
        </Embed>
      </DiscordShell>
    </div>
  );
}
