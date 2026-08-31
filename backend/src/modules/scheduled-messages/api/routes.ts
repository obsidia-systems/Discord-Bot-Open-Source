import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { fetchChannelInGuild } from "../../../core/http/channelScope.js";
import { parse } from "../../../core/http/validate.js";
import { recordId } from "../../../core/http/schemas.js";
import {
  createScheduledMessageSchema,
  toggleScheduledSchema,
  updateScheduledMessageSchema,
} from "./schema.js";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  getScheduledMessage,
  listScheduledMessages,
  setScheduledMessageActive,
  updateScheduledMessage,
} from "../service.js";

function parseMessageId(raw: string): number {
  return parse(recordId, raw);
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
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = parse(createScheduledMessageSchema, req.body ?? {});
        if (typeof body.channelId === "string" && body.channelId.trim()) {
          await fetchChannelInGuild(bot, body.channelId.trim(), guildId);
        }
        const message = await createScheduledMessage(body, guildId);
        res.status(201).json({ message });
      } catch (error) {
        next(error);
      }
    })();
  });

  /** PATCH /api/scheduled-messages/:id */
  router.patch("/:id", async (req, res, next) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const messageId = parseMessageId(req.params.id);
        const body = parse(updateScheduledMessageSchema, req.body ?? {});
        if (typeof body.channelId === "string" && body.channelId.trim()) {
          await fetchChannelInGuild(bot, body.channelId.trim(), guildId);
        }
        const message = await updateScheduledMessage(messageId, body, guildId);
        res.json({ message });
      } catch (error) {
        next(error);
      }
    })();
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
