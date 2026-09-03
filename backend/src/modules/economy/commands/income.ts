import {
  applyEconomyMessageTemplate,
  type EconomyCrime,
  type EconomyJob,
  incomeChoiceMode,
  normalizeMinMax,
} from "@adobos/shared";
import type {
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { consumeInteractionEphemeral } from "#modules/system-commands/ephemeral.js";
import { pickRandom, randomBelow, randomInclusive } from "../casino/rng.js";
import {
  assertCooldownAvailable,
  setCooldownMinutes,
} from "../domain/cooldowns.js";
import {
  EconomyError,
  getEconomyConfig,
  getUserEconomyBalance,
  listEconomyLeaderboardRows,
  parseBankAmountInput,
} from "../domain/economy.js";
import {
  adjustEconomyFunds,
  claimFixedIncome,
  creditWallet,
  debitWallet,
  depositToBank,
  type FixedIncomeType,
  robWallet,
  transferWalletPay,
  withdrawFromBank,
} from "../domain/funds.js";
import { getEconomyIncomeConfig } from "../domain/incomeService.js";
import {
  clearMessageComponents,
  parseOwnerCustomId,
  TABLE_IDLE_MS,
  tableKey,
} from "./casinoCommon.js";
import { EPHEMERAL, visibility } from "./visibility.js";

function randomInt(min: number, max: number): number {
  const { min: a, max: b } = normalizeMinMax(min, max);
  if (a === b) return a;
  return randomInclusive(a, b);
}

export const WK_SELECT_PREFIX = "wk_";
export const CR_SELECT_PREFIX = "cr_";

interface JobPending {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  kind: "work" | "crime";
  timeout: ReturnType<typeof setTimeout>;
}

const jobPending = new Map<string, JobPending>();

function clearJobPending(key: string): void {
  const row = jobPending.get(key);
  if (!row) return;
  clearTimeout(row.timeout);
  jobPending.delete(key);
}

async function replyEconomyError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  deferred: boolean,
): Promise<void> {
  const message =
    error instanceof EconomyError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Couldn't complete the action.";
  const content = `❌ ${message}`;
  if (deferred) {
    await interaction.editReply({ content });
  } else if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, ...EPHEMERAL });
  } else {
    await interaction.reply({ content, ...EPHEMERAL });
  }
}

/**
 * /balance [usuario]
 */
export async function handleBalanceCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const target = interaction.options.getUser("user") ?? interaction.user;
  const economy = await getEconomyConfig(interaction.guildId);
  const bal = await getUserEconomyBalance(interaction.guildId, target.id);
  const currency = economy.currencyName || "coins";

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setAuthor({
      name: target.tag,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setTitle("Balance")
    .addFields(
      {
        name: "Wallet",
        value: `\`${bal.wallet.toLocaleString("es-MX")}\` ${currency}`,
        inline: true,
      },
      {
        name: "Bank",
        value: `\`${bal.bank.toLocaleString("es-MX")}\` ${currency}`,
        inline: true,
      },
      {
        name: "Net worth",
        value: `\`${bal.total.toLocaleString("es-MX")}\` ${currency}`,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ...visibility(ephemeral) });
}

/**
 * /deposit cantidad — cartera → banco.
 */
export async function handleDepositCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(visibility(ephemeral));

  try {
    const raw = interaction.options.getString("amount", true);
    const amount = parseBankAmountInput(raw);
    const result = await depositToBank(
      interaction.guildId,
      interaction.user.id,
      amount,
    );
    const economy = await getEconomyConfig(interaction.guildId);
    const currency = economy.currencyName || "coins";

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Deposit complete")
      .setDescription(
        `You moved **${result.moved.toLocaleString("es-MX")}** ${currency} into the bank.`,
      )
      .addFields(
        {
          name: "Wallet",
          value: `\`${result.wallet.toLocaleString("es-MX")}\``,
          inline: true,
        },
        {
          name: "Bank",
          value: `\`${result.bank.toLocaleString("es-MX")}\``,
          inline: true,
        },
        {
          name: "Net worth",
          value: `\`${result.total.toLocaleString("es-MX")}\``,
          inline: true,
        },
      )
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

/**
 * /withdraw cantidad — banco → cartera.
 */
export async function handleWithdrawCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(visibility(ephemeral));

  try {
    const raw = interaction.options.getString("amount", true);
    const amount = parseBankAmountInput(raw);
    const result = await withdrawFromBank(
      interaction.guildId,
      interaction.user.id,
      amount,
    );
    const economy = await getEconomyConfig(interaction.guildId);
    const currency = economy.currencyName || "coins";

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle("Withdrawal complete")
      .setDescription(
        `You withdrew **${result.moved.toLocaleString("es-MX")}** ${currency} from the bank.`,
      )
      .addFields(
        {
          name: "Wallet",
          value: `\`${result.wallet.toLocaleString("es-MX")}\``,
          inline: true,
        },
        {
          name: "Bank",
          value: `\`${result.bank.toLocaleString("es-MX")}\``,
          inline: true,
        },
        {
          name: "Net worth",
          value: `\`${result.total.toLocaleString("es-MX")}\``,
          inline: true,
        },
      )
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

/**
 * /pay usuario cantidad
 */
export async function handlePayCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (target.bot) {
    await interaction.reply({
      content: "You can't pay a bot.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply(visibility(ephemeral));

  try {
    const economy = await getEconomyConfig(interaction.guildId);
    const result = await transferWalletPay(
      interaction.guildId,
      interaction.user.id,
      target.id,
      amount,
      economy.transferTax,
    );
    const currency = economy.currencyName || "coins";
    const taxNote =
      result.tax > 0
        ? `\nTax (${economy.transferTax}%): **${result.tax.toLocaleString("es-MX")}** ${currency}`
        : "";

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Transfer complete")
      .setDescription(
        `You sent **${result.sent.toLocaleString("es-MX")}** ${currency} to <@${target.id}>.${taxNote}\n` +
          `<@${target.id}> received **${result.received.toLocaleString("es-MX")}** ${currency}.`,
      )
      .addFields({
        name: "Your wallet",
        value: `\`${result.fromWallet.toLocaleString("es-MX")}\``,
        inline: true,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

/**
 * Handler compartido /daily · /weekly · /monthly.
 */
async function handleFixedIncome(
  interaction: ChatInputCommandInteraction,
  incomeType: FixedIncomeType,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply(visibility(ephemeral));

  try {
    const economy = await getEconomyConfig(interaction.guildId);
    const income = await getEconomyIncomeConfig(interaction.guildId);
    const basePay =
      incomeType === "daily"
        ? income.dailyPay
        : incomeType === "weekly"
          ? income.weeklyPay
          : income.monthlyPay;

    const result = await claimFixedIncome(
      interaction.guildId,
      interaction.user.id,
      incomeType,
      basePay,
      income.streakEnabled,
      income.streakBonusPercent,
    );

    const currency = economy.currencyName || "coins";
    const symbol = economy.currencySymbol?.trim() || "";
    const currencyLabel = symbol ? `${currency} (${symbol})` : currency;

    const titles: Record<FixedIncomeType, string> = {
      daily: "Daily reward",
      weekly: "Weekly reward",
      monthly: "Monthly reward",
    };
    const footers: Record<FixedIncomeType, string> = {
      daily: "Come back in 24 hours.",
      weekly: "Come back in 7 days.",
      monthly: "Come back in 30 days.",
    };

    let description = `You claimed **${result.amount.toLocaleString("es-MX")}** ${currencyLabel}.`;
    if (incomeType === "daily" && income.streakEnabled) {
      description += `\n🔥 Streak x${result.streak} → +${result.bonusPercent}% bonus`;
    }
    description += `\nAlso available: \`/weekly\` (${income.weeklyPay.toLocaleString("es-MX")}) · \`/monthly\` (${income.monthlyPay.toLocaleString("es-MX")})`;

    const embed = new EmbedBuilder()
      .setColor(0xfbbf24)
      .setTitle(titles[incomeType])
      .setDescription(description)
      .addFields({
        name: "Wallet",
        value: `\`${result.wallet.toLocaleString("es-MX")}\``,
        inline: true,
      })
      .setFooter({ text: footers[incomeType] });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

/** /daily */
export async function handleDailyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleFixedIncome(interaction, "daily");
}

/** /weekly */
export async function handleWeeklyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleFixedIncome(interaction, "weekly");
}

/** /monthly */
export async function handleMonthlyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleFixedIncome(interaction, "monthly");
}

/**
 * /work
 */
export async function handleWorkCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply(visibility(ephemeral));

  try {
    await assertCooldownAvailable(
      interaction.guildId,
      interaction.user.id,
      "work",
    );

    const income = await getEconomyIncomeConfig(interaction.guildId);
    if (income.jobs.length === 0) {
      throw new EconomyError(
        "No jobs configured. An admin can create them in the panel (Income and Jobs).",
        400,
        "NO_JOBS",
      );
    }

    const mode = incomeChoiceMode(income.jobs.length);
    if (mode === "select") {
      await promptJobSelect(interaction, "work", income.jobs);
      return;
    }

    const job = mode === "auto" ? income.jobs[0]! : pickRandom(income.jobs);
    await settleWork(interaction, job);
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

/**
 * /crime
 */
export async function handleCrimeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply(visibility(ephemeral));

  try {
    await assertCooldownAvailable(
      interaction.guildId,
      interaction.user.id,
      "crime",
    );

    const income = await getEconomyIncomeConfig(interaction.guildId);
    if (income.crimes.length === 0) {
      throw new EconomyError(
        "No crimes configured. An admin can create them in the panel (Income and Jobs).",
        400,
        "NO_CRIMES",
      );
    }

    const mode = incomeChoiceMode(income.crimes.length);
    if (mode === "select") {
      await promptJobSelect(interaction, "crime", income.crimes);
      return;
    }

    const crime =
      mode === "auto" ? income.crimes[0]! : pickRandom(income.crimes);
    await settleCrime(interaction, crime);
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

async function promptJobSelect(
  interaction: ChatInputCommandInteraction,
  kind: "work" | "crime",
  items: Array<EconomyJob | EconomyCrime>,
): Promise<void> {
  const prefix = kind === "work" ? WK_SELECT_PREFIX : CR_SELECT_PREFIX;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}pick:${interaction.user.id}`)
    .setPlaceholder(kind === "work" ? "Choose a job" : "Choose a crime")
    .addOptions(
      items.slice(0, 5).map((item) => ({
        label: item.name.slice(0, 100),
        value: item.id.slice(0, 100),
      })),
    );

  await interaction.editReply({
    content:
      kind === "work"
        ? "Choose the job. The cooldown starts on confirm."
        : "Choose the crime. The cooldown starts on confirm.",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  });
  const reply = await interaction.fetchReply();
  const key = tableKey(interaction.guildId!, interaction.user.id);
  clearJobPending(key);
  const row: JobPending = {
    guildId: interaction.guildId!,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    messageId: reply.id,
    kind,
    timeout: setTimeout(() => undefined, 0),
  };
  row.timeout = setTimeout(() => {
    void (async () => {
      const current = jobPending.get(key);
      if (!current) return;
      await clearMessageComponents({
        client: interaction.client,
        channelId: current.channelId,
        messageId: current.messageId,
      });
      clearJobPending(key);
    })();
  }, TABLE_IDLE_MS);
  jobPending.set(key, row);
}

async function settleWork(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  job: EconomyJob,
): Promise<void> {
  const guildId = interaction.guildId!;
  const economy = await getEconomyConfig(guildId);
  const payout = randomInt(job.minPay, job.maxPay);
  const bal = await creditWallet(guildId, interaction.user.id, payout);
  await setCooldownMinutes(
    guildId,
    interaction.user.id,
    "work",
    job.cooldownMinutes,
  );

  const currency = economy.currencyName || "coins";
  const text = applyEconomyMessageTemplate(job.successMessage, {
    job: job.name,
    payout: payout.toLocaleString("es-MX"),
    currency,
  });

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`Job: ${job.name}`)
    .setDescription(text)
    .addFields({
      name: "Wallet",
      value: `\`${bal.wallet.toLocaleString("es-MX")}\``,
      inline: true,
    })
    .setFooter({
      text: `Next job in ${job.cooldownMinutes} min.`,
    });

  if (interaction.isStringSelectMenu()) {
    await interaction.update({
      embeds: [embed],
      components: [],
      content: null,
    });
  } else if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      embeds: [embed],
      components: [],
      content: null,
    });
  }
}

async function settleCrime(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  crime: EconomyCrime,
): Promise<void> {
  const guildId = interaction.guildId!;
  const economy = await getEconomyConfig(guildId);
  const roll = 1 + randomBelow(100);
  const success = roll <= crime.successChance;
  const currency = economy.currencyName || "coins";

  let description: string;
  let color: number;
  let wallet: number;

  if (success) {
    const payout = randomInt(crime.minReward, crime.maxReward);
    const bal = await creditWallet(guildId, interaction.user.id, payout);
    wallet = bal.wallet;
    description = applyEconomyMessageTemplate(crime.successMessage, {
      crime: crime.name,
      payout: payout.toLocaleString("es-MX"),
      fine: "0",
      currency,
    });
    color = 0x57f287;
  } else {
    const fine = randomInt(crime.minFine, crime.maxFine);
    const bal = await debitWallet(guildId, interaction.user.id, fine);
    wallet = bal.wallet;
    description = applyEconomyMessageTemplate(crime.failMessage, {
      crime: crime.name,
      payout: "0",
      fine: bal.taken.toLocaleString("es-MX"),
      currency,
    });
    color = 0xef4444;
  }

  await setCooldownMinutes(
    guildId,
    interaction.user.id,
    "crime",
    crime.cooldownMinutes,
  );

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(success ? "Crime succeeded" : "You got caught")
    .setDescription(description)
    .addFields(
      {
        name: "Tirada",
        value: `\`${roll}\` / ${crime.successChance}%`,
        inline: true,
      },
      {
        name: "Wallet",
        value: `\`${wallet.toLocaleString("es-MX")}\``,
        inline: true,
      },
    )
    .setFooter({
      text: `Next attempt in ${crime.cooldownMinutes} min.`,
    });

  if (interaction.isStringSelectMenu()) {
    await interaction.update({
      embeds: [embed],
      components: [],
      content: null,
    });
  } else if (interaction.deferred || interaction.replied) {
    await interaction.editReply({
      embeds: [embed],
      components: [],
      content: null,
    });
  }
}

export async function handleWorkSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await handleIncomeSelect(interaction, "work");
}

export async function handleCrimeSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await handleIncomeSelect(interaction, "crime");
}

async function handleIncomeSelect(
  interaction: StringSelectMenuInteraction,
  kind: "work" | "crime",
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This menu only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const { ownerId } = parseOwnerCustomId(interaction.customId);
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ This choice isn't yours.",
      ...EPHEMERAL,
    });
    return;
  }

  const key = tableKey(interaction.guildId, ownerId);
  const pending = jobPending.get(key);
  if (!pending || pending.kind !== kind) {
    await interaction.reply({
      content: "❌ This choice expired.",
      ...EPHEMERAL,
    });
    return;
  }
  clearJobPending(key);

  try {
    await assertCooldownAvailable(
      interaction.guildId,
      interaction.user.id,
      kind,
    );
    const income = await getEconomyIncomeConfig(interaction.guildId);
    const id = interaction.values[0] ?? "";
    if (kind === "work") {
      const job = income.jobs.find((j) => j.id === id);
      if (!job) {
        throw new EconomyError(
          "That job no longer exists.",
          400,
          "JOB_MISSING",
        );
      }
      await settleWork(interaction, job);
    } else {
      const crime = income.crimes.find((c) => c.id === id);
      if (!crime) {
        throw new EconomyError(
          "That crime no longer exists.",
          400,
          "CRIME_MISSING",
        );
      }
      await settleCrime(interaction, crime);
    }
  } catch (error) {
    const message =
      error instanceof EconomyError
        ? error.message
        : "Couldn't complete the action.";
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ ${message}`, ...EPHEMERAL });
    } else {
      await interaction.editReply({ content: `❌ ${message}`, components: [] });
    }
  }
}

/**
 * /baltop — top de patrimonio (economía).
 * (`/leaderboard` sigue siendo XP.)
 */
export async function handleBaltopCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(visibility(ephemeral));

  const economy = await getEconomyConfig(interaction.guildId);
  const currency = economy.currencyName || "coins";
  const rows = await listEconomyLeaderboardRows(interaction.guildId, 10);

  if (rows.length === 0) {
    await interaction.editReply({
      content: "No balances recorded in this server yet.",
    });
    return;
  }

  const lines: string[] = [];
  for (const row of rows) {
    const member = await interaction.guild.members
      .fetch(row.userId)
      .catch(() => null);
    const name =
      member?.displayName ??
      member?.user.username ??
      `User ${row.userId.slice(-4)}`;
    const medal =
      row.rank === 1
        ? "🥇"
        : row.rank === 2
          ? "🥈"
          : row.rank === 3
            ? "🥉"
            : `**${row.rank}.**`;
    lines.push(
      `${medal} **${name}** — \`${row.total.toLocaleString("es-MX")}\` ${currency}`,
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle("Wealth leaderboard")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Sorted by wallet + bank" })
    .setTimestamp(new Date());

  await interaction.editReply({ embeds: [embed] });
}

/**
 * /addmoney — admin.
 */
export async function handleAddMoneyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const result = await adjustEconomyFunds({
      guildId: interaction.guildId,
      userId: target.id,
      target: "wallet",
      action: "add",
      amount,
    });
    const economy = await getEconomyConfig(interaction.guildId);
    await interaction.reply({
      content: `Added **${amount.toLocaleString("es-MX")}** ${economy.currencyName} to <@${target.id}>. Wallet: \`${result.wallet.toLocaleString("es-MX")}\`.`,
      ...visibility(ephemeral),
    });
  } catch (error) {
    await replyEconomyError(interaction, error, false);
  }
}

/**
 * /removemoney — admin.
 */
export async function handleRemoveMoneyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const result = await adjustEconomyFunds({
      guildId: interaction.guildId,
      userId: target.id,
      target: "wallet",
      action: "remove",
      amount,
    });
    const economy = await getEconomyConfig(interaction.guildId);
    await interaction.reply({
      content: `Removed **${amount.toLocaleString("es-MX")}** ${economy.currencyName} from <@${target.id}>. Wallet: \`${result.wallet.toLocaleString("es-MX")}\`.`,
      ...visibility(ephemeral),
    });
  } catch (error) {
    await replyEconomyError(interaction, error, false);
  }
}

/**
 * /setmoney — admin. Mismo mutator atómico que el panel (`action: set`).
 */
export async function handleSetMoneyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const result = await adjustEconomyFunds({
      guildId: interaction.guildId,
      userId: target.id,
      target: "wallet",
      action: "set",
      amount,
    });
    const economy = await getEconomyConfig(interaction.guildId);
    await interaction.reply({
      content: `<@${target.id}>'s wallet set to **${amount.toLocaleString("es-MX")}** ${economy.currencyName}. Bank: \`${result.bank.toLocaleString("es-MX")}\`.`,
      ...visibility(ephemeral),
    });
  } catch (error) {
    await replyEconomyError(interaction, error, false);
  }
}

/**
 * /collect-income — salarios de rol.
 */
export async function handleCollectIncomeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply(visibility(ephemeral));

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const income = await getEconomyIncomeConfig(interaction.guildId);
    const economy = await getEconomyConfig(interaction.guildId);
    const currency = economy.currencyName || "coins";

    if (income.roleSalaries.length === 0) {
      throw new EconomyError(
        "No role salaries configured. An admin creates them in Income and Jobs.",
        400,
        "NO_SALARIES",
      );
    }

    const mine = income.roleSalaries.filter((s) =>
      member.roles.cache.has(s.roleId),
    );
    if (mine.length === 0) {
      throw new EconomyError(
        "You don't have any salaried role in this server.",
        400,
        "NO_SALARY_ROLE",
      );
    }

    const lines: string[] = [];
    let total = 0;
    let wallet = (
      await getUserEconomyBalance(interaction.guildId, interaction.user.id)
    ).wallet;

    for (const salary of mine) {
      const key = `salary:${salary.id}`;
      try {
        await assertCooldownAvailable(
          interaction.guildId,
          interaction.user.id,
          key,
        );
      } catch {
        lines.push(
          `<@&${salary.roleId}> — on cooldown (${salary.frequency === "weekly" ? "weekly" : "daily"})`,
        );
        continue;
      }
      const paid = await creditWallet(
        interaction.guildId,
        interaction.user.id,
        salary.amount,
      );
      wallet = paid.wallet;
      total += salary.amount;
      await setCooldownMinutes(
        interaction.guildId,
        interaction.user.id,
        key,
        salary.frequency === "weekly" ? 7 * 24 * 60 : 24 * 60,
      );
      lines.push(
        `<@&${salary.roleId}> — **${salary.amount.toLocaleString("es-MX")}** ${currency}`,
      );
    }

    if (total === 0) {
      throw new EconomyError(
        `All your salaries are on cooldown.\n${lines.join("\n")}`,
        400,
        "SALARY_COOLDOWN",
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0xfbbf24)
      .setTitle("Salary collected")
      .setDescription(
        `You claimed **${total.toLocaleString("es-MX")}** ${currency}.\n\n${lines.join("\n")}`,
      )
      .addFields({
        name: "Wallet",
        value: `\`${wallet.toLocaleString("es-MX")}\``,
        inline: true,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}

/**
 * /rob usuario — cartera vs cartera. Apagado por defecto.
 */
export async function handleRobCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  if (target.bot) {
    await interaction.reply({
      content: "You can't rob a bot.",
      ...EPHEMERAL,
    });
    return;
  }
  if (target.id === interaction.user.id) {
    await interaction.reply({
      content: "You can't rob yourself.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply(visibility(ephemeral));

  try {
    const income = await getEconomyIncomeConfig(interaction.guildId);
    const rob = income.rob;
    if (!rob.enabled) {
      throw new EconomyError(
        "Robbing is disabled in this server.",
        400,
        "ROB_DISABLED",
      );
    }

    await assertCooldownAvailable(
      interaction.guildId,
      interaction.user.id,
      "rob",
    );

    const victimBal = await getUserEconomyBalance(
      interaction.guildId,
      target.id,
    );
    if (victimBal.wallet < rob.minTargetWallet) {
      throw new EconomyError(
        `That wallet is below the minimum (${rob.minTargetWallet.toLocaleString("es-MX")}). The bank can't be robbed.`,
        400,
        "ROB_TARGET_POOR",
      );
    }

    const economy = await getEconomyConfig(interaction.guildId);
    const currency = economy.currencyName || "coins";
    const success = randomBelow(100) < rob.successChance;
    const stealPercent = randomInt(rob.minStealPercent, rob.maxStealPercent);
    const stealAmount = Math.max(
      1,
      Math.floor((victimBal.wallet * stealPercent) / 100),
    );
    const robberBal = await getUserEconomyBalance(
      interaction.guildId,
      interaction.user.id,
    );
    const fineAmount = Math.floor(
      (robberBal.wallet * rob.failFinePercent) / 100,
    );

    const result = await robWallet({
      guildId: interaction.guildId,
      robberId: interaction.user.id,
      victimId: target.id,
      success,
      stealAmount,
      fineAmount,
    });

    await setCooldownMinutes(
      interaction.guildId,
      interaction.user.id,
      "rob",
      rob.cooldownMinutes,
    );

    const embed = new EmbedBuilder()
      .setColor(success ? 0x57f287 : 0xef4444)
      .setTitle(success ? "Robbery succeeded" : "You got caught")
      .setDescription(
        success
          ? `You took **${result.stolen.toLocaleString("es-MX")}** ${currency} from <@${target.id}>'s wallet.`
          : `You failed. Fine of **${result.fine.toLocaleString("es-MX")}** ${currency}. <@${target.id}>'s bank is untouched.`,
      )
      .addFields({
        name: "Your wallet",
        value: `\`${result.robberWallet.toLocaleString("es-MX")}\``,
        inline: true,
      })
      .setFooter({ text: `Next attempt in ${rob.cooldownMinutes} min.` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
  }
}
