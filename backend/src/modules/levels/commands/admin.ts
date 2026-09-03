import {
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { consumeInteractionEphemeral } from "../../system-commands/ephemeral.js";
import {
  addUserXp,
  deductUserXp,
  getLevelsConfigCached,
  setUserLevel,
} from "../service.js";
import { syncLevelsProgress } from "../events.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function replyFlags(ephemeral: boolean) {
  return ephemeral ? EPHEMERAL : {};
}

async function requireLevelsGuild(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      ...EPHEMERAL,
    });
    return null;
  }
  const config = await getLevelsConfigCached(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "The Levels module is disabled in this server.",
      ...EPHEMERAL,
    });
    return null;
  }
  return interaction.guildId;
}

/**
 * /givexp usuario cantidad — suma XP y recalcula nivel.
 */
export async function handleGiveXpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = await requireLevelsGuild(interaction);
  if (!guildId) return;

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (amount < 1) {
    await interaction.reply({
      content: "The amount must be greater than 0.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const result = await addUserXp(guildId, target.id, amount);
  await syncLevelsProgress({
    client: interaction.client,
    guildId,
    userId: target.id,
    previousLevel: result.previousLevel,
    newLevel: result.newLevel,
    xp: result.xp,
  });

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("XP granted")
    .setDescription(
      `You added **${amount.toLocaleString("es-MX")}** XP to <@${target.id}>.`,
    )
    .addFields(
      {
        name: "XP total",
        value: `\`${result.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Level",
        value: `\`${result.newLevel}\``,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  if (result.leveledUp) {
    embed.setFooter({
      text: `Leveled up from ${result.previousLevel} → ${result.newLevel}`,
    });
  }

  await interaction.reply({ embeds: [embed], ...replyFlags(ephemeral) });
}

/**
 * /removexp usuario cantidad — resta XP (mín. 0) y recalcula nivel.
 */
export async function handleRemoveXpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = await requireLevelsGuild(interaction);
  if (!guildId) return;

  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (amount < 1) {
    await interaction.reply({
      content: "The amount must be greater than 0.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const result = await deductUserXp(guildId, target.id, amount);
  await syncLevelsProgress({
    client: interaction.client,
    guildId,
    userId: target.id,
    previousLevel: result.previousLevel,
    newLevel: result.newLevel,
    xp: result.xp,
  });
  const removed = Math.abs(result.gained);

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("XP removed")
    .setDescription(
      `You removed **${removed.toLocaleString("es-MX")}** XP from <@${target.id}>.`,
    )
    .addFields(
      {
        name: "XP total",
        value: `\`${result.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Level",
        value: `\`${result.newLevel}\``,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  if (result.newLevel < result.previousLevel) {
    embed.setFooter({
      text: `Leveled down from ${result.previousLevel} → ${result.newLevel}`,
    });
  }

  await interaction.reply({ embeds: [embed], ...replyFlags(ephemeral) });
}

/**
 * /setlevel usuario nivel — fija nivel y XP base de ese nivel.
 */
export async function handleSetLevelCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = await requireLevelsGuild(interaction);
  if (!guildId) return;

  const target = interaction.options.getUser("user", true);
  const level = interaction.options.getInteger("level", true);
  if (level < 0) {
    await interaction.reply({
      content: "The level must be ≥ 0.",
      ...EPHEMERAL,
    });
    return;
  }

  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const result = await setUserLevel(guildId, target.id, level);
  await syncLevelsProgress({
    client: interaction.client,
    guildId,
    userId: target.id,
    previousLevel: result.previousLevel,
    newLevel: result.level,
    xp: result.xp,
  });

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle("Level set")
    .setDescription(
      `<@${target.id}>'s level was manually set to **${result.level}**.`,
    )
    .addFields(
      {
        name: "XP base",
        value: `\`${result.xp.toLocaleString("es-MX")}\``,
        inline: true,
      },
      {
        name: "Before",
        value: `Level ${result.previousLevel} · \`${result.previousXp.toLocaleString("es-MX")}\` XP`,
        inline: true,
      },
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ...replyFlags(ephemeral) });
}
