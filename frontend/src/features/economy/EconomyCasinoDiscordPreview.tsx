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

function Embed({
  color,
  title,
  description,
  buttons,
}: {
  color: string;
  title: string;
  description: string;
  buttons?: string[];
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
            <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
              {description}
            </p>
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
    Math.min(config.maxBet, Math.round((config.minBet + config.maxBet) / 4) || 100),
  );

  let command = "/coinflip";
  let title = "Casino";
  let description = "";
  let color = ACCENT;
  let buttons: string[] | undefined;

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
    description += `\n\nApuesta: **${sampleBet.toLocaleString("es-MX")}** · Multiplicador x${config.coinflip.multiplier}`;
    color = SUCCESS;
    buttons = ["🪙 Cara", "🌑 Cruz"];
  } else if (tab === "roulette") {
    command = "/roulette";
    title = "Ruleta";
    description = [
      `Apuesta de ejemplo: **${sampleBet.toLocaleString("es-MX")}** ${currency}`,
      "",
      `🔴/⚫ Color → **x${config.roulette.colorMultiplier}**`,
      `🟢 Verde → **x${config.roulette.greenMultiplier}**`,
      `🔢 Número exacto → **x${config.roulette.numberMultiplier}**`,
    ].join("\n");
    color = ACCENT;
    buttons = ["Rojo", "Negro", "Verde", "Número"];
  } else {
    command = "/blackjack";
    title = "Blackjack";
    description = [
      `Apuesta: **${sampleBet.toLocaleString("es-MX")}** ${currency}`,
      `Blackjack natural → **x${config.blackjack.blackjackMultiplier}**`,
      `Doblar (Double Down): **${config.blackjack.allowDoubleDown ? "Permitido" : "No permitido"}**`,
      "",
      "Tú: **A♠ 10♥** (21)  ·  Crupier: **??**",
    ].join("\n");
    color = SUCCESS;
    buttons = config.blackjack.allowDoubleDown
      ? ["Pedir", "Plantarse", "Doblar"]
      : ["Pedir", "Plantarse"];
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
        />
      </DiscordShell>
    </div>
  );
}
