import type { GuildMember, PartialGuildMember } from "discord.js";
import {
  dispatchCanvasEventCard,
  userPayloadFromDiscordUser,
} from "../sendCard.js";

/**
 * Boost: `old.premiumSince` null → `new.premiumSince` con fecha.
 */
export async function onGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  if (newMember.user.bot) return;

  const wasBoosting = Boolean(oldMember.premiumSince);
  const isBoosting = Boolean(newMember.premiumSince);
  if (wasBoosting || !isBoosting) return;

  await dispatchCanvasEventCard({
    eventType: "boost",
    guild: newMember.guild,
    user: userPayloadFromDiscordUser(newMember.user, newMember.displayName),
    logLabel: "Boost",
  });
}
