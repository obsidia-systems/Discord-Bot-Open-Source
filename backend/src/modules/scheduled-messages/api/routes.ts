import { Router } from "express";
import type { Client } from "discord.js";
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

export function scheduledMessagesRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/scheduled-messages */
  router.get("/", (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const messages = listScheduledMessages(guildId);
      res.json({ messages });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/scheduled-messages/:id */
  router.get("/:id", (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const messageId = parseMessageId(req.params.id);
      const message = getScheduledMessage(messageId, guildId);
      res.json({ message });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/scheduled-messages */
  router.post("/", (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const body = (req.body ?? {}) as CreateScheduledMessageRequest;
      const message = createScheduledMessage(body, guildId);
      res.status(201).json({ message });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PATCH /api/scheduled-messages/:id */
  router.patch("/:id", (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const messageId = parseMessageId(req.params.id);
      const body = (req.body ?? {}) as UpdateScheduledMessageRequest;
      const message = updateScheduledMessage(messageId, body, guildId);
      res.json({ message });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/scheduled-messages/:id/toggle — body: { isActive: boolean } */
  router.post("/:id/toggle", (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const messageId = parseMessageId(req.params.id);
      const isActive = Boolean(req.body?.isActive);
      const message = setScheduledMessageActive(messageId, isActive, guildId);
      res.json({ message });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** DELETE /api/scheduled-messages/:id */
  router.delete("/:id", (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const messageId = parseMessageId(req.params.id);
      deleteScheduledMessage(messageId, guildId);
      res.status(204).send();
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
