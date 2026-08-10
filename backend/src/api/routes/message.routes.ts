import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  SendEmbedRequest,
  SendMessageRequest,
} from "@adobos/shared";
import {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
} from "../controllers/messages.js";

function handleMessageError(error: unknown, res: import("express").Response): void {
  if (error instanceof MessageSendError) {
    const errorBody: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(errorBody);
    return;
  }

  console.error("[adobos] Error inesperado en /api/messages:", error);
  const errorBody: ApiErrorBody = {
    error: "Error interno al enviar el mensaje.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(errorBody);
}

export function messageRoutes(bot: Client): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body as Partial<SendMessageRequest>;

    if (
      typeof body.channelId !== "string" ||
      typeof body.content !== "string"
    ) {
      const errorBody: ApiErrorBody = {
        error: "Body inválido. Se requieren channelId y content (string).",
        code: "INVALID_BODY",
      };
      res.status(400).json(errorBody);
      return;
    }

    try {
      const result = await sendTextMessage(bot, {
        channelId: body.channelId,
        content: body.content,
      });
      res.status(201).json(result);
    } catch (error: unknown) {
      handleMessageError(error, res);
    }
  });

  router.post("/embed", async (req, res) => {
    const body = req.body as Partial<SendEmbedRequest>;

    if (typeof body.channelId !== "string") {
      const errorBody: ApiErrorBody = {
        error: "Body inválido. Se requiere channelId (string).",
        code: "INVALID_BODY",
      };
      res.status(400).json(errorBody);
      return;
    }

    const payload: SendEmbedRequest = {
      channelId: body.channelId,
      content: typeof body.content === "string" ? body.content : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      description:
        typeof body.description === "string" ? body.description : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      authorName:
        typeof body.authorName === "string" ? body.authorName : undefined,
      authorIconUrl:
        typeof body.authorIconUrl === "string" ? body.authorIconUrl : undefined,
      thumbnailUrl:
        typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : undefined,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      footerText:
        typeof body.footerText === "string" ? body.footerText : undefined,
      footerIconUrl:
        typeof body.footerIconUrl === "string" ? body.footerIconUrl : undefined,
    };

    try {
      const result = await sendEmbedMessage(bot, payload);
      res.status(201).json(result);
    } catch (error: unknown) {
      handleMessageError(error, res);
    }
  });

  return router;
}
