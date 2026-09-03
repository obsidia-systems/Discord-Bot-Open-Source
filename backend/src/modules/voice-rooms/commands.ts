import { VOICE_ROOM_SELECT_PREFIX, type VoiceRoomAction } from "@adobos/shared";
import type {
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { EPHEMERAL, loadRoomContext, runVoiceRoomAction } from "./actions.js";
import { buildControlSelect } from "./rooms.js";
import { VoiceRoomsError } from "./service.js";

async function replyError(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof VoiceRoomsError
      ? error.message
      : "Couldn't apply that action.";
  const payload = { content: message, ...EPHEMERAL };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }
  await interaction.reply(payload).catch(() => null);
}

export async function handleVoiceCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.member) {
    await interaction.reply({
      content: "Use this command in a server.",
      ...EPHEMERAL,
    });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  if (!member) {
    await interaction.reply({
      content: "I couldn't load your member.",
      ...EPHEMERAL,
    });
    return;
  }
  try {
    const ctx = await loadRoomContext(member);
    const message = await runVoiceRoomAction({
      member,
      room: ctx.room,
      generator: ctx.generator,
      channel: ctx.channel,
      action: sub as VoiceRoomAction | "unlock" | "unghost",
      name: interaction.options.getString("name") ?? undefined,
      limit: interaction.options.getInteger("limit") ?? undefined,
      bitrate: interaction.options.getInteger("kbps") ?? undefined,
      status: interaction.options.getString("text") ?? undefined,
      targetUserId: interaction.options.getUser("user")?.id ?? null,
      targetRoleId: interaction.options.getRole("role")?.id ?? null,
      inviteMessage: interaction.options.getString("message") ?? undefined,
    });
    await interaction.reply({ content: message, ...EPHEMERAL });
  } catch (error: unknown) {
    await replyError(interaction, error);
  }
}

export async function handleVoiceRoomSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Use this in a server.",
      ...EPHEMERAL,
    });
    return;
  }
  const channelId = interaction.customId.slice(VOICE_ROOM_SELECT_PREFIX.length);
  const action = interaction.values[0] as
    | VoiceRoomAction
    | "unlock"
    | "unghost"
    | undefined;
  if (!action || !channelId) {
    await interaction.reply({
      content: "Invalid action.",
      ...EPHEMERAL,
    });
    return;
  }
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  if (!member) {
    await interaction.reply({
      content: "I couldn't load your member.",
      ...EPHEMERAL,
    });
    return;
  }
  try {
    if (member.voice.channelId !== channelId) {
      await interaction.reply({
        content: "Join that room to manage it.",
        ...EPHEMERAL,
      });
      return;
    }
    const ctx = await loadRoomContext(member);
    const message = await runVoiceRoomAction({
      member,
      room: ctx.room,
      generator: ctx.generator,
      channel: ctx.channel,
      action,
    });
    if (interaction.message) {
      await interaction.update({
        content: interaction.message.content,
        components: [buildControlSelect(channelId)],
      });
      await interaction.followUp({
        content: message,
        ...EPHEMERAL,
      });
      return;
    }
    await interaction.reply({ content: message, ...EPHEMERAL });
  } catch (error: unknown) {
    await replyError(interaction, error);
  }
}
