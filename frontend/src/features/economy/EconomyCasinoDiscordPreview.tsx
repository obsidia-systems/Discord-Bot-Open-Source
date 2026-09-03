import type { EconomyCasinoConfig } from "@adobos/shared";
import { applyEconomyMessageTemplate } from "@adobos/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MOCK_USER = "@SampleUser";
const MOCK_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
const BOT_NAME = "Adobos Bot";
const ACCENT = "#e11d48";
const SUCCESS = "#57F287";

export type EconomyCasinoSimulatorTab =
  | "global"
  | "coinflip"
  | "roulette"
  | "blackjack"
  | "slots";

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
            <span className="text-[11px] text-[#949ba4]">Today at 12:00</span>
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
        title="Hidden card"
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
          You · 21
        </p>
        <div className="flex gap-1">
          <AppEmojiCard rank="A" suit="spades" />
          <AppEmojiCard rank="10" suit="hearts" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#949ba4]">
          Dealer
        </p>
        <div className="flex gap-1">
          <AppEmojiCard rank="K" suit="clubs" />
          <AppEmojiCard faceDown />
        </div>
      </div>
      <p className="text-[10px] text-[#949ba4]">
        Preview with App Emoji (cards as images in Discord).
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
  const currency = currencyName || "coins";
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
    title = "Casino closed";
    description =
      "⛔ The casino is disabled in this server.\nEnable it on the General tab.";
    color = "#ed4245";
  } else if (tab === "global") {
    command = "/coinflip";
    title = "Bet limits";
    description = [
      `Minimum bet: **${config.minBet.toLocaleString("en-US")}** ${currency}`,
      `Maximum bet: **${config.maxBet.toLocaleString("en-US")}** ${currency}`,
      "",
      "Usa `/coinflip`, `/roulette`, `/blackjack` o `/slots`.",
    ].join("\n");
    color = ACCENT;
  } else if (tab === "coinflip") {
    command = "/coinflip";
    const payout = Math.floor(sampleBet * config.coinflip.multiplier);
    title = "Coinflip — You won!";
    description = applyEconomyMessageTemplate(config.coinflip.winMessage, {
      side: "Heads",
      payout: payout.toLocaleString("en-US"),
      currency,
    });
    description += [
      "",
      `Bet: **${sampleBet.toLocaleString("en-US")}** · x${config.coinflip.multiplier}`,
      `Cooldown: **${config.coinflip.cooldownSeconds}s**`,
    ].join("\n");
    color = SUCCESS;
    buttons = ["Again"];
  } else if (tab === "roulette") {
    command = "/roulette";
    title = "Roulette";
    description = [
      `Sample bet: **${sampleBet.toLocaleString("en-US")}** ${currency}`,
      `Cooldown: **${config.roulette.cooldownSeconds}s**`,
      "",
      `🔴/⚫ Color → **x${config.roulette.colorMultiplier}**`,
      `🟢 Green → **x${config.roulette.greenMultiplier}**`,
      `🔢 Exact number → **x${config.roulette.numberMultiplier}**`,
    ].join("\n");
    color = ACCENT;
    buttons = ["Red", "Black", "Green"];
    if (config.roulette.showNumberHistory) {
      extra = (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#949ba4]">
            Last 5
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
  } else if (tab === "slots") {
    command = "/slots";
    title = "Slots";
    description = [
      `Bet: **${sampleBet.toLocaleString("en-US")}** ${currency}`,
      `Cooldown: **${config.slots.cooldownSeconds}s**`,
      "",
      "Pair (2 of 3) ×1.7 · 🍒🍒🍒 ×3 · 💎💎💎 ×80",
    ].join("\n");
    color = SUCCESS;
    buttons = ["Again"];
  } else {
    command = "/blackjack";
    title = "Blackjack";
    description = [
      `Bet: **${sampleBet.toLocaleString("en-US")}** ${currency}`,
      `Natural blackjack → **x${config.blackjack.blackjackMultiplier}**`,
      `Decks: **${config.blackjack.deckCount}** · Soft 17: **${config.blackjack.standOnSoft17 ? "Stand" : "Hit"}**`,
      `Double: **${config.blackjack.allowDoubleDown ? "Allowed" : "Not allowed"}**`,
      `Split: **${config.blackjack.allowSplit ? "Allowed" : "Not allowed"}**`,
    ].join("\n");
    color = SUCCESS;
    const bjButtons = ["Hit", "Stand"];
    if (config.blackjack.allowDoubleDown) bjButtons.push("Double");
    if (config.blackjack.allowSplit) bjButtons.push("Split");
    buttons = bjButtons;
    extra = <BlackjackHandPreview />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <DiscordShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} used <span className="text-[#00a8fc]">{command}</span>
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
