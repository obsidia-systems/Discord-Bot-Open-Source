import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { isStarboardDestinationChannelType } from "@adobos/shared";
import { fetchChannelInGuild } from "../../../core/http/channelScope.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { updateStarboardSettingsSchema } from "./schema.js";
import {
  getStarboardConfig,
  StarboardError,
  updateStarboardSettings,
} from "../service.js";

async function assertDestinationChannel(
  bot: Client,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await fetchChannelInGuild(bot, channelId, guildId);
  if (!isStarboardDestinationChannelType(channel.type)) {
    const kind =
      channel.type === ChannelType.GuildForum ? "a forum" : "this channel type";
    throw new StarboardError(
      `Use a text or announcement channel (not ${kind}).`,
      400,
      "INVALID_CHANNEL_TYPE",
    );
  }
}

export function starboardRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await getStarboardConfig(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/settings", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateStarboardSettingsSchema, req.body ?? {});
      if (typeof body.channelId === "string" && body.channelId.trim()) {
        await assertDestinationChannel(bot, body.channelId.trim(), guildId);
      }
      const settings = await updateStarboardSettings(body, guildId);
      res.json({ settings });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
