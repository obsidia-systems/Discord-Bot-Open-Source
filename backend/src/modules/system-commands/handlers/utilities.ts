import { SYSTEM_COMMAND_CATALOG } from "@adobos/shared";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getCommandPermission } from "../domain/system-commands.js";
import { consumeInteractionEphemeral } from "../ephemeral.js";

function asGuildMember(
  member: ChatInputCommandInteraction["member"],
): GuildMember | null {
  if (!member || typeof member === "string" || !("permissions" in member)) {
    return null;
  }
  return member as GuildMember;
}

export async function handleUserInfoCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const user = interaction.options.getUser("user") ?? interaction.user;
  const member = interaction.guild
    ? await interaction.guild.members.fetch(user.id).catch(() => null)
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "ID", value: `\`${user.id}\``, inline: true },
      {
        name: "Cuenta",
        value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: "Ingreso",
        value: member?.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : "—",
        inline: true,
      },
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ephemeral });
}

export async function handleAvatarCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, false);
  const user = interaction.options.getUser("user") ?? interaction.user;
  const member = interaction.guild
    ? await interaction.guild.members.fetch(user.id).catch(() => null)
    : null;
  const globalUrl = user.displayAvatarURL({ size: 4096 });
  const guildUrl = member?.avatar
    ? member.displayAvatarURL({ size: 4096 })
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`Avatar — ${user.tag}`)
    .setImage(guildUrl ?? globalUrl)
    .setDescription(
      guildUrl
        ? `[Global](${globalUrl}) · [Server](${guildUrl})`
        : `[Open](${globalUrl})`,
    );

  await interaction.reply({ embeds: [embed], ephemeral });
}

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const ephemeral = consumeInteractionEphemeral(interaction.id, true);
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command only works in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = asGuildMember(interaction.member);
  const canSeeAdmin =
    Boolean(member?.permissions.has(PermissionFlagsBits.Administrator)) ||
    Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild)) ||
    Boolean(member?.permissions.has(PermissionFlagsBits.ModerateMembers));

  const lines: string[] = [];
  for (const def of SYSTEM_COMMAND_CATALOG) {
    const perm = await getCommandPermission(guildId, def.name);
    if (!perm.enabled) continue;
    if (
      def.requiresAdminByDefault &&
      perm.allowedRoles.length === 0 &&
      !canSeeAdmin
    ) {
      continue;
    }
    lines.push(`\`/${def.name}\` — ${def.description}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle("Available commands")
    .setDescription(
      lines.length > 0
        ? lines.slice(0, 40).join("\n")
        : "No commands are enabled.",
    )
    .setFooter({
      text: lines.length > 40 ? `Showing 40 of ${lines.length}` : "Adobos Bot",
    });

  await interaction.reply({ embeds: [embed], ephemeral });
}
