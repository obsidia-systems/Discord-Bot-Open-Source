import type { Guild, GuildMember, PartialGuildMember } from "discord.js";
import { shouldDispatchLeave } from "@adobos/shared";
import {
  dispatchCanvasEventCard,
  userPayloadFromDiscordUser,
} from "../sendCard.js";

export async function guildHasBan(guild: Guild, userId: string): Promise<boolean> {
  try {
    await guild.bans.fetch(userId);
    return true;
  } catch {
    return false;
  }
}

export async function onGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const user = member.user;
  if (!user || user.bot) return;

  if (!shouldDispatchLeave(await guildHasBan(member.guild, user.id))) {
    return;
  }

  const displayName =
    "displayName" in member && typeof member.displayName === "string"
      ? member.displayName
      : user.globalName || user.username;

  await dispatchCanvasEventCard({
    eventType: "leave",
    guild: member.guild,
    user: userPayloadFromDiscordUser(user, displayName),
    logLabel: "Leave",
  });
}
