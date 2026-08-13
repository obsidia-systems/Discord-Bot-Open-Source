import type { GuildMember, PartialGuildMember } from "discord.js";
import {
  dispatchCanvasEventCard,
  userPayloadFromDiscordUser,
} from "../sendCard.js";

export async function onGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const user = member.user;
  if (!user || user.bot) return;

  const displayName =
    "displayName" in member && typeof member.displayName === "string"
      ? member.displayName
      : user.globalName || user.username;

  await dispatchCanvasEventCard({
    eventType: "leave",
    guild: member.guild,
    user: userPayloadFromDiscordUser(user, displayName),
    logLabel: "Despedida",
  });
}
