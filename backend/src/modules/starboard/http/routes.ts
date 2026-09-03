import { isStarboardDestinationChannelType } from "@adobos/shared";
import { ChannelType } from "discord.js";
import { Router } from "express";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import {
  getStarboardConfig,
  StarboardError,
  updateStarboardSettings,
} from "../domain/starboard.js";
import { updateStarboardSettingsSchema } from "./schema.js";

async function assertDestinationChannel(
  gateway: BotGateway,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await gateway.getChannel(guildId, channelId);
  if (!channel) {
    throw new StarboardError(
      "The channel is not in this server.",
      404,
      "CHANNEL_NOT_FOUND",
    );
  }
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

export function starboardRoutes(gateway: BotGateway): Router {
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
            gateway,
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
