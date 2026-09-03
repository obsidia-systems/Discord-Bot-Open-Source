import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "../../../core/http/channelScope.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  isScheduledDestinationChannel,
  sendScheduledMessageNow,
} from "../scheduler.js";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  getScheduledMessage,
  listScheduledMessages,
  ScheduledMessagesError,
  setScheduledMessageActive,
  updateScheduledMessage,
} from "../service.js";
import {
  createScheduledMessageSchema,
  toggleScheduledSchema,
  updateScheduledMessageSchema,
} from "./schema.js";

function parseMessageId(raw: string): number {
  return parse(recordId, raw);
}

async function assertDestinationChannel(
  bot: Client,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await fetchChannelInGuild(bot, channelId, guildId);
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

export function scheduledMessagesRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/scheduled-messages */
  router.get("/", async (req, res, next) => {
    try {
      const messages = await listScheduledMessages(guildIdOf(req));
      res.json({ messages });
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/scheduled-messages/:id */
  router.get("/:id", async (req, res, next) => {
    try {
      const messageId = parseMessageId(req.params.id);
      const message = await getScheduledMessage(messageId, guildIdOf(req));
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/scheduled-messages */
  router.post("/", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(createScheduledMessageSchema, req.body ?? {});
      if (typeof body.channelId === "string" && body.channelId.trim()) {
        await assertDestinationChannel(bot, body.channelId.trim(), guildId);
      }
      const message = await createScheduledMessage(body, guildId);
      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
  });

  /** PATCH /api/scheduled-messages/:id */
  router.patch("/:id", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const messageId = parseMessageId(req.params.id);
      const body = parse(updateScheduledMessageSchema, req.body ?? {});
      if (typeof body.channelId === "string" && body.channelId.trim()) {
        await assertDestinationChannel(bot, body.channelId.trim(), guildId);
      }
      const message = await updateScheduledMessage(messageId, body, guildId);
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/scheduled-messages/:id/toggle — body: { isActive: boolean } */
  router.post("/:id/toggle", async (req, res, next) => {
    try {
      const messageId = parseMessageId(req.params.id);
      const { isActive } = parse(toggleScheduledSchema, req.body ?? {});
      const message = await setScheduledMessageActive(
        messageId,
        isActive,
        guildIdOf(req),
      );
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/scheduled-messages/:id/send-now */
  router.post("/:id/send-now", async (req, res, next) => {
    try {
      const messageId = parseMessageId(req.params.id);
      const message = await sendScheduledMessageNow(messageId, guildIdOf(req));
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  /** DELETE /api/scheduled-messages/:id */
  router.delete("/:id", async (req, res, next) => {
    try {
      const messageId = parseMessageId(req.params.id);
      await deleteScheduledMessage(messageId, guildIdOf(req));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
