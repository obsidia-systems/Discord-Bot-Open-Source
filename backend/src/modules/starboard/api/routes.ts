import { isStarboardDestinationChannelType } from "@adobos/shared";
import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "#core/http/channelScope.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import {
  getStarboardConfig,
  StarboardError,
  updateStarboardSettings,
} from "../service.js";
import { updateStarboardSettingsSchema } from "./schema.js";

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

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getStarboardConfig(guildIdOf(req)));
    }),
  );

  router.patch(
    "/settings",
    defineRoute(
      { body: updateStarboardSettingsSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        if (
          typeof valid.body.channelId === "string" &&
          valid.body.channelId.trim()
        ) {
          await assertDestinationChannel(
            bot,
            valid.body.channelId.trim(),
            guildId,
          );
        }
        const settings = await updateStarboardSettings(valid.body, guildId);
        res.json({ settings });
      },
    ),
  );

  return router;
}
