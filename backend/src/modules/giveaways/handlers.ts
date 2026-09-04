import { GIVEAWAY_JOIN_PREFIX, parseGiveawayRecordId } from "@adobos/shared";
import {
  type ButtonInteraction,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { LocalClientGateway } from "#core/discord/localClientGateway.js";
import { joinGiveawayFromMember } from "./actions.js";
import { GiveawaysError } from "./domain/giveaways.js";

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function asGuildMember(
  member: ButtonInteraction["member"],
): GuildMember | null {
  if (member && "roles" in member && member.roles && "cache" in member.roles) {
    return member as GuildMember;
  }
  return null;
}

function mapError(error: unknown): string {
  if (error instanceof GiveawaysError) return error.message;
  return "An error occurred while entering.";
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
      content: "I couldn't read you as a server member.",
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.deferReply(EPHEMERAL);
  try {
    const result = await joinGiveawayFromMember({
      gateway: new LocalClientGateway(interaction.client),
      giveawayId,
      member,
    });
    await interaction.editReply({
      content: result.joined
        ? `You're in. There are **${result.giveaway.entryCount}** entrant(s). Click again to leave.`
        : `Has salido. Quedan **${result.giveaway.entryCount}** participante(s).`,
    });
  } catch (error: unknown) {
    await interaction.editReply({ content: mapError(error) });
  }
}
