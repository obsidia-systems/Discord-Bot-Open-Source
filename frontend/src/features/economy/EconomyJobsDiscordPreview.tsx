import type { EconomyCrime, EconomyIncomeConfig, EconomyJob } from "@adobos/shared";
import { applyEconomyMessageTemplate } from "@adobos/shared";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const MOCK_USER = "@SampleUser";
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
            <span className="text-[11px] text-[#949ba4]">Today at 12:00</span>
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

function mid(min: number, max: number): number {
  return Math.round((min + max) / 2);
}

export type EconomyJobsSimulatorTab = "fixed" | "jobs" | "crimes" | "rob";

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
  const currency = currencyName || "coins";

  if (tab === "fixed") {
    const streakLine = config.streakEnabled
      ? `\n🔥 Streak x3 → +${config.streakBonusPercent * 3}% bonus`
      : "";
    const payout = config.dailyPay;
    const bonus = config.streakEnabled
      ? Math.floor((payout * config.streakBonusPercent * 3) / 100)
      : 0;
    const salaryHint =
      config.roleSalaries.length > 0
        ? `\n\nAlso: \`/collect-income\` for role salaries.`
        : "";
    return (
      <DiscordMessageShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} used <span className="text-[#00a8fc]">/daily</span>
        </p>
        <DiscordEmbed
          color={INFO_COLOR}
          title="Daily reward"
          description={`You claimed **${payout + bonus}** ${currency} (${currencySymbol}).${streakLine}\n\nAlso available: /weekly (${config.weeklyPay}) · /monthly (${config.monthlyPay})${salaryHint}`}
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
        name: "Miner",
        minPay: 50,
        maxPay: 150,
        cooldownMinutes: 60,
        successMessage: "You worked as a {job} and earned {payout} {currency}.",
      } satisfies EconomyJob);
    const payout = mid(job.minPay, job.maxPay);
    const text = applyEconomyMessageTemplate(job.successMessage, {
      job: job.name,
      payout,
      currency,
    });
    const choose =
      config.jobs.length >= 2 && config.jobs.length <= 5
        ? config.jobs.map((j) => j.name)
        : undefined;
    return (
      <DiscordMessageShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} used <span className="text-[#00a8fc]">/work</span>
        </p>
        {choose ? (
          <DiscordEmbed
            color={INFO_COLOR}
            title="Pick a job"
            description="The cooldown starts when you confirm."
            buttons={choose}
          />
        ) : (
          <DiscordEmbed
            color={SUCCESS_COLOR}
            title={`Job: ${job.name}`}
            description={`${text}\n\n⏱️ Next job in **${job.cooldownMinutes}** min.`}
          />
        )}
      </DiscordMessageShell>
    );
  }

  if (tab === "rob") {
    const rob = config.rob;
    return (
      <DiscordMessageShell>
        <p className="text-[#dbdee1]">
          {MOCK_USER} used <span className="text-[#00a8fc]">/rob @Member</span>
        </p>
        <DiscordEmbed
          color={rob.enabled ? SUCCESS_COLOR : FAIL_COLOR}
          title={rob.enabled ? "Robbery succeeded" : "Robbery disabled"}
          description={
            rob.enabled
              ? `You took **${Math.round((500 * (rob.minStealPercent + rob.maxStealPercent)) / 200)}** ${currency} from the wallet.\n\nSuccess ${rob.successChance}% · cooldown ${rob.cooldownMinutes} min.\nThe bank can't be robbed.`
              : "Robbery is disabled in this server."
          }
        />
      </DiscordMessageShell>
    );
  }

  const crime =
    activeCrime ??
    config.crimes[0] ??
    ({
      id: "preview",
      name: "Rob a bank",
      successChance: 40,
      minReward: 100,
      maxReward: 400,
      minFine: 50,
      maxFine: 200,
      cooldownMinutes: 60,
      successMessage:
        "Success! You pulled off \"{crime}\" and got away with {payout} {currency}.",
      failMessage:
        "You got caught during \"{crime}\". Fine of {fine} {currency}.",
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
        {MOCK_USER} used <span className="text-[#00a8fc]">/crime</span>
      </p>
      <DiscordEmbed
        color={success ? SUCCESS_COLOR : FAIL_COLOR}
        title={success ? `Crime succeeded` : `Crime failed`}
        description={`${text}\n\n🎲 Success chance: **${crime.successChance}%**`}
      />
    </DiscordMessageShell>
  );
}
