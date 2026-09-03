import { isStreamAlertDestinationChannelType } from "@adobos/shared";
import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "#core/http/channelScope.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  createStreamAlert,
  deleteStreamAlert,
  listStreamAlertsConfig,
  StreamAlertsError,
  updateStreamAlert,
} from "../domain/stream-alerts.js";
import { createStreamAlertSchema, updateStreamAlertSchema } from "./schema.js";

async function assertDestinationChannel(
  bot: Client,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await fetchChannelInGuild(bot, channelId, guildId);
  if (!isStreamAlertDestinationChannelType(channel.type)) {
    const kind =
      channel.type === ChannelType.GuildForum ? "a forum" : "this channel type";
    throw new StreamAlertsError(
      `Use a text or announcement channel (not ${kind}).`,
      400,
      "INVALID_CHANNEL_TYPE",
    );
  }
}

export function streamAlertsRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await listStreamAlertsConfig(guildIdOf(req)));
    }),
  );

  router.post(
    "/",
    defineRoute({ body: createStreamAlertSchema }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      await assertDestinationChannel(bot, valid.body.discordChannelId, guildId);
      const alert = await createStreamAlert(valid.body, guildId);
      res.status(201).json({ alert });
    }),
  );

  router.patch(
    "/:id",
    defineRoute(
      { params: idParams, body: updateStreamAlertSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        if (
          typeof valid.body.discordChannelId === "string" &&
          valid.body.discordChannelId
        ) {
          await assertDestinationChannel(
            bot,
            valid.body.discordChannelId,
            guildId,
          );
        }
        const alert = await updateStreamAlert(
          valid.params.id,
          valid.body,
          guildId,
        );
        res.json({ alert });
      },
    ),
  );

  router.delete(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      await deleteStreamAlert(valid.params.id, guildIdOf(req));
      res.status(204).send();
    }),
  );

  return router;
}
