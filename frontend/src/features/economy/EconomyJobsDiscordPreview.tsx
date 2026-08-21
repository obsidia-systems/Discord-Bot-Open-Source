import type { EconomyCrime, EconomyIncomeConfig, EconomyJob } from "@adobos/shared";
import { applyEconomyMessageTemplate } from "@adobos/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MOCK_USER = "@UsuarioDePrueba";
const MOCK_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
const BOT_NAME = "Adobos Bot";
const SUCCESS_COLOR = "#57F287";
const FAIL_COLOR = "#ED4245";
const INFO_COLOR = "#5865F2";

function DiscordMessageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-[#313338] p-3 text-[13px] text-[#dbdee1] shadow-sm",
        className,
      )}
    >
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

function DiscordEmbed({
  color,
  title,
  description,
}: {
  color: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-1 overflow-hidden rounded-sm bg-[#2b2d31]">
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
  );
}

function mid(min: number, max: number): number {
  return Math.round((min + max) / 2);
}

export type EconomyJobsSimulatorTab = "fixed" | "jobs" | "crimes";

export function EconomyJobsDiscordPreview({
  tab,
  config,
  currencyName,
  currencySymbol,
  activeJob,
  activeCrime,
  crimeOutcome = "success",
}: {
  tab: EconomyJobsSimulatorTab;
  config: EconomyIncomeConfig;
  currencyName: string;
  currencySymbol: string;
  activeJob?: EconomyJob | null;
  activeCrime?: EconomyCrime | null;
  crimeOutcome?: "success" | "fail";
}) {
  const currency = currencyName || "monedas";

  if (tab === "fixed") {
    const streakLine = config.streakEnabled
      ? `\n🔥 Racha x3 → +${config.streakBonusPercent * 3}% bonus`
      : "";
    const payout = config.dailyPay;
    const bonus = config.streakEnabled
      ? Math.floor((payout * config.streakBonusPercent * 3) / 100)
      : 0;
    return (
      <DiscordMessageShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} usó <span className="text-[#00a8fc]">/daily</span>
        </p>
        <DiscordEmbed
          color={INFO_COLOR}
          title="Recompensa diaria"
          description={`Has reclamado **${payout + bonus}** ${currency} (${currencySymbol}).${streakLine}\n\nTambién disponibles: /weekly (${config.weeklyPay}) · /monthly (${config.monthlyPay})`}
        />
      </DiscordMessageShell>
    );
  }

  if (tab === "jobs") {
    const job =
      activeJob ??
      config.jobs[0] ??
      ({
        id: "preview",
        name: "Minero",
        minPay: 50,
        maxPay: 150,
        cooldownMinutes: 60,
        successMessage: "Trabajaste de {job} y ganaste {payout} {currency}.",
      } satisfies EconomyJob);
    const payout = mid(job.minPay, job.maxPay);
    const text = applyEconomyMessageTemplate(job.successMessage, {
      job: job.name,
      payout,
      currency,
    });
    return (
      <DiscordMessageShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} usó <span className="text-[#00a8fc]">/work</span>
        </p>
        <DiscordEmbed
          color={SUCCESS_COLOR}
          title={`Trabajo: ${job.name}`}
          description={`${text}\n\n⏱️ Próximo trabajo en **${job.cooldownMinutes}** min.`}
        />
      </DiscordMessageShell>
    );
  }

  const crime =
    activeCrime ??
    config.crimes[0] ??
    ({
      id: "preview",
      name: "Robar un banco",
      successChance: 40,
      minReward: 100,
      maxReward: 400,
      minFine: 50,
      maxFine: 200,
      successMessage:
        "¡Éxito! Completaste «{crime}» y escapaste con {payout} {currency}.",
      failMessage:
        "Te atraparon en «{crime}». Multa de {fine} {currency}.",
    } satisfies EconomyCrime);

  const success = crimeOutcome === "success";
  const payout = mid(crime.minReward, crime.maxReward);
  const fine = mid(crime.minFine, crime.maxFine);
  const text = applyEconomyMessageTemplate(
    success ? crime.successMessage : crime.failMessage,
    {
      crime: crime.name,
      payout,
      fine,
      currency,
    },
  );

  return (
    <DiscordMessageShell>
      <p className="text-[#dbdee1]">
        {MOCK_USER} usó <span className="text-[#00a8fc]">/crime</span>
      </p>
      <DiscordEmbed
        color={success ? SUCCESS_COLOR : FAIL_COLOR}
        title={success ? `Crimen exitoso` : `Crimen fallido`}
        description={`${text}\n\n🎲 Probabilidad de éxito: **${crime.successChance}%**`}
      />
    </DiscordMessageShell>
  );
}
