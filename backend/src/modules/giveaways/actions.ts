import type { CreateGiveawayRequest, Giveaway } from "@adobos/shared";
import { canEnterGiveaway, giveawayEntryGateReason } from "@adobos/shared";
import type { Client, GuildMember } from "discord.js";
import { logger } from "#core/log.js";
import {
  announceGiveawayWinners,
  requireGuild,
  upsertGiveawayMessage,
} from "./discord.js";
import {
  applyGiveawayAction,
  GiveawaysError,
  getGiveawayById,
  getGiveawaySettings,
  insertGiveaway,
  setGiveawayMessageId,
  toggleGiveawayEntry,
} from "./domain/giveaways.js";

export async function createAndPublishGiveaway(input: {
  bot: Client;
  guildId: string;
  createdBy: string;
  body: CreateGiveawayRequest;
}): Promise<Giveaway> {
  const giveaway = await insertGiveaway({
    guildId: input.guildId,
    createdBy: input.createdBy,
    body: input.body,
  });
  if (giveaway.status !== "running") return giveaway;
  try {
    const messageId = await upsertGiveawayMessage(input.bot, giveaway);
    await setGiveawayMessageId(giveaway.id, messageId);
    return { ...giveaway, messageId };
  } catch (error: unknown) {
    logger.warn({ err: error }, "giveaways: couldn't publish");
    await applyGiveawayAction({
      giveawayId: giveaway.id,
      guildId: giveaway.guildId,
      action: "cancel",
    }).catch(() => undefined);
    throw error instanceof GiveawaysError
      ? error
      : new GiveawaysError(
          "I couldn't publish the giveaway in that channel. Check permissions.",
          400,
          "PUBLISH_FAILED",
        );
  }
}

export async function startGiveawayMessage(
  bot: Client,
  giveawayId: number,
  guildId: string,
): Promise<Giveaway> {
  const started = await applyGiveawayAction({
    giveawayId,
    guildId,
    action: "start",
  });
  const messageId = await upsertGiveawayMessage(bot, started);
  await setGiveawayMessageId(started.id, messageId);
  return { ...started, messageId };
}

export async function republishGiveaway(
  bot: Client,
  giveawayId: number,
  guildId: string,
): Promise<Giveaway> {
  const current = await getGiveawayById(giveawayId, guildId);
  const messageId = await upsertGiveawayMessage(bot, {
    ...current,
    messageId: null,
  });
  await setGiveawayMessageId(current.id, messageId);
  return { ...current, messageId };
}

export async function joinGiveawayFromMember(input: {
  bot: Client;
  giveawayId: number;
  member: GuildMember;
}): Promise<{ joined: boolean; giveaway: Giveaway }> {
  const giveaway = await getGiveawayById(input.giveawayId);
  if (giveaway.guildId !== input.member.guild.id) {
    throw new GiveawaysError("Giveaway not found.", 404, "NOT_FOUND");
  }
  if (!canEnterGiveaway(giveaway.status)) {
    throw new GiveawaysError(
      "This giveaway is not accepting entries.",
      409,
      "NOT_RUNNING",
    );
  }
  const gate = giveawayEntryGateReason({
    memberRoleIds: [...input.member.roles.cache.keys()],
    requiredRoleIds: giveaway.requiredRoleIds,
    blockedRoleIds: giveaway.blockedRoleIds,
    accountCreatedAt: input.member.user.createdAt,
    guildJoinedAt: input.member.joinedAt,
    minAccountAgeDays: giveaway.minAccountAgeDays,
    minGuildAgeDays: giveaway.minGuildAgeDays,
  });
  if (gate) {
    throw new GiveawaysError(gate, 403, "NOT_ELIGIBLE");
  }
  const result = await toggleGiveawayEntry(giveaway.id, input.member.id);
  const fresh = await getGiveawayById(giveaway.id);
  const live = { ...fresh, entryCount: result.entryCount };
  await upsertGiveawayMessage(input.bot, live).catch((error: unknown) => {
    logger.warn({ err: error }, "giveaways: couldn't update the message");
  });
  return { joined: result.joined, giveaway: live };
}

export async function endGiveawayNow(input: {
  bot: Client;
  giveawayId: number;
  guildId: string;
}): Promise<Giveaway> {
  await requireGuild(input.bot, input.guildId);
  const ended = await applyGiveawayAction({
    giveawayId: input.giveawayId,
    guildId: input.guildId,
    action: "end",
  });
  const settings = await getGiveawaySettings(input.guildId);
  await upsertGiveawayMessage(input.bot, ended).catch(() => undefined);
  await announceGiveawayWinners({
    bot: input.bot,
    giveaway: ended,
    settings,
    newWinnerIds: ended.winnerIds,
    isReroll: false,
  });
  return ended;
}

export async function cancelGiveawayNow(input: {
  bot: Client;
  giveawayId: number;
  guildId: string;
}): Promise<Giveaway> {
  const cancelled = await applyGiveawayAction({
    giveawayId: input.giveawayId,
    guildId: input.guildId,
    action: "cancel",
  });
  await upsertGiveawayMessage(input.bot, cancelled).catch(() => undefined);
  return cancelled;
}

export async function rerollGiveawayNow(input: {
  bot: Client;
  giveawayId: number;
  guildId: string;
}): Promise<Giveaway> {
  const rerolled = await applyGiveawayAction({
    giveawayId: input.giveawayId,
    guildId: input.guildId,
    action: "reroll",
  });
  const settings = await getGiveawaySettings(input.guildId);
  await upsertGiveawayMessage(input.bot, rerolled).catch(() => undefined);
  await announceGiveawayWinners({
    bot: input.bot,
    giveaway: rerolled,
    settings,
    newWinnerIds: rerolled.winnerIds,
    isReroll: true,
  });
  return rerolled;
}
