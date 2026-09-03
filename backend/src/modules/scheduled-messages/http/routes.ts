import { ChannelType } from "discord.js";
import { Router } from "express";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  getScheduledMessage,
  listScheduledMessages,
  ScheduledMessagesError,
  setScheduledMessageActive,
  updateScheduledMessage,
} from "../domain/scheduled-messages.js";
import {
  isScheduledDestinationChannel,
  sendScheduledMessageNow,
} from "../jobs.js";
import {
  createScheduledMessageSchema,
  toggleScheduledSchema,
  updateScheduledMessageSchema,
} from "./schema.js";

async function assertDestinationChannel(
  gateway: BotGateway,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await gateway.getChannel(guildId, channelId);
  if (!channel) {
    throw new ScheduledMessagesError(
      "The channel is not in this server.",
      404,
      "CHANNEL_NOT_FOUND",
    );
  }
  if (!isScheduledDestinationChannel(channel)) {
    const kind =
      channel.type === ChannelType.GuildForum ? "a forum" : "this channel type";
    throw new ScheduledMessagesError(
      `Use a text or announcement channel (not ${kind}).`,
      400,
      "INVALID_CHANNEL_TYPE",
    );
  }
}

export function scheduledMessagesRoutes(gateway: BotGateway): Router {
  const router = Router();

  /** GET /api/scheduled-messages */
  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      const messages = await listScheduledMessages(guildIdOf(req));
      res.json({ messages });
    }),
  );

  /** GET /api/scheduled-messages/:id */
  router.get(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const message = await getScheduledMessage(
        valid.params.id,
        guildIdOf(req),
      );
      res.json({ message });
    }),
  );

  /** POST /api/scheduled-messages */
  router.post(
    "/",
    defineRoute(
      { body: createScheduledMessageSchema },
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
        const message = await createScheduledMessage(valid.body, guildId);
        res.status(201).json({ message });
      },
    ),
  );

  /** PATCH /api/scheduled-messages/:id */
  router.patch(
    "/:id",
    defineRoute(
      { params: idParams, body: updateScheduledMessageSchema },
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
        const message = await updateScheduledMessage(
          valid.params.id,
          valid.body,
          guildId,
        );
        res.json({ message });
      },
    ),
  );

  /** POST /api/scheduled-messages/:id/toggle — body: { isActive: boolean } */
  router.post(
    "/:id/toggle",
    defineRoute(
      { params: idParams, body: toggleScheduledSchema },
      async (req, res, valid) => {
        const message = await setScheduledMessageActive(
          valid.params.id,
          valid.body.isActive,
          guildIdOf(req),
        );
        res.json({ message });
      },
    ),
  );

  /** POST /api/scheduled-messages/:id/send-now */
  router.post(
    "/:id/send-now",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const message = await sendScheduledMessageNow(
        valid.params.id,
        guildIdOf(req),
      );
      res.json({ message });
    }),
  );

  /** DELETE /api/scheduled-messages/:id */
  router.delete(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      await deleteScheduledMessage(valid.params.id, guildIdOf(req));
      res.status(204).send();
    }),
  );

  return router;
}
