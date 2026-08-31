import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { sendIfEntitlementError } from "../../../core/entitlements/service.js";
import { ChannelScopeError, fetchChannelInGuild } from "../../../core/http/channelScope.js";
import type {
  ApiErrorBody,
  CreateScheduledMessageRequest,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import {
  ScheduledMessagesError,
  createScheduledMessage,
  deleteScheduledMessage,
  getScheduledMessage,
  listScheduledMessages,
  setScheduledMessageActive,
  updateScheduledMessage,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfEntitlementError(error, res)) return;
  if (error instanceof ChannelScopeError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  if (error instanceof ScheduledMessagesError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/scheduled-messages:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Mensajes programados.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

function parseMessageId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) {
    throw new ScheduledMessagesError(
      "ID de mensaje inválido.",
      400,
      "INVALID_ID",
    );
  }
  return id;
}

export function scheduledMessagesRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/scheduled-messages */
  router.get("/", async (req, res) => {
    try {
      const messages = await listScheduledMessages(guildIdOf(req));
      res.json({ messages });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/scheduled-messages/:id */
  router.get("/:id", async (req, res) => {
    try {
      const messageId = parseMessageId(req.params.id);
      const message = await getScheduledMessage(messageId, guildIdOf(req));
      res.json({ message });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/scheduled-messages */
  router.post("/", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = (req.body ?? {}) as CreateScheduledMessageRequest;
        if (typeof body.channelId === "string" && body.channelId.trim()) {
          await fetchChannelInGuild(bot, body.channelId.trim(), guildId);
        }
        const message = await createScheduledMessage(body, guildId);
        res.status(201).json({ message });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** PATCH /api/scheduled-messages/:id */
  router.patch("/:id", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const messageId = parseMessageId(req.params.id);
        const body = (req.body ?? {}) as UpdateScheduledMessageRequest;
        if (typeof body.channelId === "string" && body.channelId.trim()) {
          await fetchChannelInGuild(bot, body.channelId.trim(), guildId);
        }
        const message = await updateScheduledMessage(messageId, body, guildId);
        res.json({ message });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** POST /api/scheduled-messages/:id/toggle — body: { isActive: boolean } */
  router.post("/:id/toggle", async (req, res) => {
    try {
      const messageId = parseMessageId(req.params.id);
      const isActive = Boolean(req.body?.isActive);
      const message = await setScheduledMessageActive(
        messageId,
        isActive,
        guildIdOf(req),
      );
      res.json({ message });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** DELETE /api/scheduled-messages/:id */
  router.delete("/:id", async (req, res) => {
    try {
      const messageId = parseMessageId(req.params.id);
      await deleteScheduledMessage(messageId, guildIdOf(req));
      res.status(204).send();
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
