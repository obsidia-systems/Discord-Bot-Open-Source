import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  MessageActionRowInput,
  MessageButtonInput,
  MessageButtonStyle,
  SendEmbedRequest,
  SendMessageRequest,
} from "@adobos/shared";
import {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
} from "./controller.js";

const BUTTON_STYLES: MessageButtonStyle[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
  "Link",
];

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

function parseButton(raw: unknown): MessageButtonInput | null {
  if (!raw || typeof raw !== "object") return null;
  const button = raw as Record<string, unknown>;
  if (typeof button.label !== "string") return null;
  if (typeof button.style !== "string") return null;
  if (!BUTTON_STYLES.includes(button.style as MessageButtonStyle)) return null;

  return {
    label: button.label,
    style: button.style as MessageButtonStyle,
    customId: typeof button.customId === "string" ? button.customId : undefined,
    url: typeof button.url === "string" ? button.url : undefined,
    disabled: typeof button.disabled === "boolean" ? button.disabled : undefined,
    emoji: typeof button.emoji === "string" ? button.emoji : undefined,
  };
}

function parseComponents(raw: unknown): MessageActionRowInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new MessageSendError(
      "components debe ser un array de filas.",
      400,
      "INVALID_COMPONENTS",
    );
  }

  return raw.map((row, rowIndex) => {
    if (!row || typeof row !== "object" || !Array.isArray((row as { buttons?: unknown }).buttons)) {
      throw new MessageSendError(
        `Fila #${rowIndex + 1} inválida.`,
        400,
        "INVALID_ACTION_ROW",
      );
    }

    const buttons = (row as { buttons: unknown[] }).buttons
      .map(parseButton)
      .filter((button): button is MessageButtonInput => button !== null);

    if (buttons.length === 0) {
      throw new MessageSendError(
        `Fila #${rowIndex + 1} sin botones válidos.`,
        400,
        "EMPTY_ACTION_ROW",
      );
    }

    return { buttons };
  });
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

    try {
      const payload: SendEmbedRequest = {
        channelId: body.channelId,
        content: typeof body.content === "string" ? body.content : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        url: typeof body.url === "string" ? body.url : undefined,
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
        timestamp: typeof body.timestamp === "boolean" ? body.timestamp : undefined,
        components: parseComponents(body.components),
      };

      const result = await sendEmbedMessage(bot, payload);
      res.status(201).json(result);
    } catch (error: unknown) {
      handleMessageError(error, res);
    }
  });

  return router;
}
