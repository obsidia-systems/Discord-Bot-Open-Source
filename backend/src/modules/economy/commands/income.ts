import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import {
  applyEconomyMessageTemplate,
  normalizeMinMax,
} from "@adobos/shared";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import { assertCooldownAvailable, setCooldownMinutes } from "../cooldowns.js";
import { getEconomyIncomeConfig } from "../incomeService.js";
import {
  EconomyError,
  adjustEconomyFunds,
  claimFixedIncome,
  creditWallet,
  debitWallet,
  getEconomyConfig,
  getUserEconomyBalance,
  listEconomyLeaderboardRows,
  transferWalletPay,
  type FixedIncomeType,
} from "../service.js";

function randomInt(min: number, max: number): number {
  const { min: a, max: b } = normalizeMinMax(min, max);
  if (a === b) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
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
        : "No se pudo completar la acción.";
  const content = `❌ ${message}`;
  if (deferred) {
    await interaction.editReply({ content });
  } else if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const target = interaction.options.getUser("usuario") ?? interaction.user;
  const economy = getEconomyConfig(interaction.guildId);
  const bal = getUserEconomyBalance(interaction.guildId, target.id);
  const currency = economy.currencyName || "monedas";

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setAuthor({
      name: target.tag,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setTitle("Balance")
    .addFields(
      {
        name: "Cartera",
        value: `\`${bal.wallet.toLocaleString("es-MX")}\` ${currency}`,
        inline: true,
      },
      {
        name: "Banco",
        value: `\`${bal.bank.toLocaleString("es-MX")}\` ${currency}`,
        inline: true,
      },
      {
        name: "Patrimonio",
        value: `\`${bal.total.toLocaleString("es-MX")}\` ${currency}`,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ephemeral });
}

/**
 * /pay usuario cantidad
 */
export async function handlePayCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const amount = interaction.options.getInteger("cantidad", true);
  if (target.bot) {
    await interaction.reply({
      content: "No puedes pagar a un bot.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply({ ephemeral });

  try {
    const economy = getEconomyConfig(interaction.guildId);
    const result = transferWalletPay(
      interaction.guildId,
      interaction.user.id,
      target.id,
      amount,
      economy.transferTax,
    );
    const currency = economy.currencyName || "monedas";
    const taxNote =
      result.tax > 0
        ? `\nImpuesto (${economy.transferTax}%): **${result.tax.toLocaleString("es-MX")}** ${currency}`
        : "";

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Transferencia realizada")
      .setDescription(
        `Enviaste **${result.sent.toLocaleString("es-MX")}** ${currency} a <@${target.id}>.${taxNote}\n` +
          `<@${target.id}> recibió **${result.received.toLocaleString("es-MX")}** ${currency}.`,
      )
      .addFields({
        name: "Tu cartera",
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply({ ephemeral });

  try {
    const economy = getEconomyConfig(interaction.guildId);
    const income = getEconomyIncomeConfig(interaction.guildId);
    const basePay =
      incomeType === "daily"
        ? income.dailyPay
        : incomeType === "weekly"
          ? income.weeklyPay
          : income.monthlyPay;

    const result = claimFixedIncome(
      interaction.guildId,
      interaction.user.id,
      incomeType,
      basePay,
      income.streakEnabled,
      income.streakBonusPercent,
    );

    const currency = economy.currencyName || "monedas";
    const symbol = economy.currencySymbol?.trim() || "";
    const currencyLabel = symbol ? `${currency} (${symbol})` : currency;

    const titles: Record<FixedIncomeType, string> = {
      daily: "Recompensa diaria",
      weekly: "Recompensa semanal",
      monthly: "Recompensa mensual",
    };
    const footers: Record<FixedIncomeType, string> = {
      daily: "Vuelve en 24 horas.",
      weekly: "Vuelve en 7 días.",
      monthly: "Vuelve en 30 días.",
    };

    let description = `Has reclamado **${result.amount.toLocaleString("es-MX")}** ${currencyLabel}.`;
    if (incomeType === "daily" && income.streakEnabled) {
      description += `\n🔥 Racha x${result.streak} → +${result.bonusPercent}% bonus`;
    }
    description += `\nTambién disponibles: \`/weekly\` (${income.weeklyPay.toLocaleString("es-MX")}) · \`/monthly\` (${income.monthlyPay.toLocaleString("es-MX")})`;

    const embed = new EmbedBuilder()
      .setColor(0xfbbf24)
      .setTitle(titles[incomeType])
      .setDescription(description)
      .addFields({
        name: "Cartera",
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply({ ephemeral });

  try {
    assertCooldownAvailable(interaction.guildId, interaction.user.id, "work");

    const economy = getEconomyConfig(interaction.guildId);
    const income = getEconomyIncomeConfig(interaction.guildId);
    if (income.jobs.length === 0) {
      throw new EconomyError(
        "No hay trabajos configurados. Un admin puede crearlos en el panel (Ingresos y Trabajos).",
        400,
        "NO_JOBS",
      );
    }

    const job = pickRandom(income.jobs);
    const payout = randomInt(job.minPay, job.maxPay);
    const bal = creditWallet(interaction.guildId, interaction.user.id, payout);
    setCooldownMinutes(
      interaction.guildId,
      interaction.user.id,
      "work",
      job.cooldownMinutes,
    );

    const currency = economy.currencyName || "monedas";
    const text = applyEconomyMessageTemplate(job.successMessage, {
      job: job.name,
      payout: payout.toLocaleString("es-MX"),
      currency,
    });

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`Trabajo: ${job.name}`)
      .setDescription(text)
      .addFields({
        name: "Cartera",
        value: `\`${bal.wallet.toLocaleString("es-MX")}\``,
        inline: true,
      })
      .setFooter({
        text: `Próximo trabajo en ${job.cooldownMinutes} min.`,
      });

    await interaction.editReply({ embeds: [embed] });
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  await interaction.deferReply({ ephemeral });

  try {
    assertCooldownAvailable(interaction.guildId, interaction.user.id, "crime");

    const economy = getEconomyConfig(interaction.guildId);
    const income = getEconomyIncomeConfig(interaction.guildId);
    if (income.crimes.length === 0) {
      throw new EconomyError(
        "No hay crímenes configurados. Un admin puede crearlos en el panel (Ingresos y Trabajos).",
        400,
        "NO_CRIMES",
      );
    }

    const crime = pickRandom(income.crimes);
    const roll = 1 + Math.floor(Math.random() * 100);
    const success = roll <= crime.successChance;
    const currency = economy.currencyName || "monedas";

    let description: string;
    let color: number;
    let wallet: number;

    if (success) {
      const payout = randomInt(crime.minReward, crime.maxReward);
      const bal = creditWallet(
        interaction.guildId,
        interaction.user.id,
        payout,
      );
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
      const bal = debitWallet(interaction.guildId, interaction.user.id, fine);
      wallet = bal.wallet;
      description = applyEconomyMessageTemplate(crime.failMessage, {
        crime: crime.name,
        payout: "0",
        fine: bal.taken.toLocaleString("es-MX"),
        currency,
      });
      color = 0xef4444;
    }

    setCooldownMinutes(
      interaction.guildId,
      interaction.user.id,
      "crime",
      crime.cooldownMinutes,
    );

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(success ? "Crimen exitoso" : "Te atraparon")
      .setDescription(description)
      .addFields(
        {
          name: "Tirada",
          value: `\`${roll}\` / ${crime.successChance}%`,
          inline: true,
        },
        {
          name: "Cartera",
          value: `\`${wallet.toLocaleString("es-MX")}\``,
          inline: true,
        },
      )
      .setFooter({
        text: `Próximo intento en ${crime.cooldownMinutes} min.`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyEconomyError(interaction, error, true);
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  await interaction.deferReply({ ephemeral });

  const economy = getEconomyConfig(interaction.guildId);
  const currency = economy.currencyName || "monedas";
  const rows = listEconomyLeaderboardRows(interaction.guildId, 10);

  if (rows.length === 0) {
    await interaction.editReply({
      content: "Aún no hay saldos registrados en este servidor.",
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
      `Usuario ${row.userId.slice(-4)}`;
    const medal =
      row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `**${row.rank}.**`;
    lines.push(
      `${medal} **${name}** — \`${row.total.toLocaleString("es-MX")}\` ${currency}`,
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle("Top de riqueza")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Ordenado por cartera + banco" })
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const amount = interaction.options.getInteger("cantidad", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const result = adjustEconomyFunds({
      guildId: interaction.guildId,
      userId: target.id,
      target: "wallet",
      action: "add",
      amount,
    });
    const economy = getEconomyConfig(interaction.guildId);
    await interaction.reply({
      content: `Añadiste **${amount.toLocaleString("es-MX")}** ${economy.currencyName} a <@${target.id}>. Cartera: \`${result.wallet.toLocaleString("es-MX")}\`.`,
      ephemeral,
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
      content: "Este comando solo funciona en un servidor.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const amount = interaction.options.getInteger("cantidad", true);
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);

  try {
    const result = adjustEconomyFunds({
      guildId: interaction.guildId,
      userId: target.id,
      target: "wallet",
      action: "remove",
      amount,
    });
    const economy = getEconomyConfig(interaction.guildId);
    await interaction.reply({
      content: `Quitaste **${amount.toLocaleString("es-MX")}** ${economy.currencyName} a <@${target.id}>. Cartera: \`${result.wallet.toLocaleString("es-MX")}\`.`,
      ephemeral,
    });
  } catch (error) {
    await replyEconomyError(interaction, error, false);
  }
}
