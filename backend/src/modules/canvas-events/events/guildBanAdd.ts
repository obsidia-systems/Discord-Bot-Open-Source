import type { GuildBan } from "discord.js";
import {
  dispatchCanvasEventCard,
  userPayloadFromDiscordUser,
} from "../sendCard.js";

export async function onGuildBanAdd(ban: GuildBan): Promise<void> {
  if (ban.user.bot) return;

  await dispatchCanvasEventCard({
    eventType: "ban",
    guild: ban.guild,
    user: userPayloadFromDiscordUser(ban.user),
    logLabel: "Baneo",
  });
}
