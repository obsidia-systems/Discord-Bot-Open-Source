import { MessageFlags, type ButtonInteraction, type GuildMember } from "discord.js";
import { GIVEAWAY_JOIN_PREFIX, parseGiveawayRecordId } from "@adobos/shared";
import { GiveawaysError } from "./service.js";
import { joinGiveawayFromMember } from "./actions.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function asGuildMember(member: ButtonInteraction["member"]): GuildMember | null {
  if (member && "roles" in member && member.roles && "cache" in member.roles) {
    return member as GuildMember;
  }
  return null;
}

function mapError(error: unknown): string {
  if (error instanceof GiveawaysError) return error.message;
  return "Ocurrió un error al participar.";
}

export async function onGiveawayJoinButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guild) return;
  const giveawayId = parseGiveawayRecordId(
    interaction.customId,
    GIVEAWAY_JOIN_PREFIX,
  );
  if (giveawayId == null) return;
  const member = asGuildMember(interaction.member);
  if (!member) {
    await interaction.reply({
      content: "No pude leerte como miembro del servidor.",
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.deferReply(EPHEMERAL);
  try {
    const result = await joinGiveawayFromMember({
      bot: interaction.client,
      giveawayId,
      member,
    });
    await interaction.editReply({
      content: result.joined
        ? `Has entrado. Hay **${result.giveaway.entryCount}** participante(s). Vuelve a pulsar para salir.`
        : `Has salido. Quedan **${result.giveaway.entryCount}** participante(s).`,
    });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}
