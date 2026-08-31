import multer from "multer";
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
  type EmbedUploadedFiles,
} from "./controller.js";
import { guildIdOf } from "../../../core/http/guildContext.js";

const BUTTON_STYLES: MessageButtonStyle[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
  "Link",
];

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const embedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Solo PNG, JPG o WEBP (máx. 5MB)."));
      return;
    }
    cb(null, true);
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "authorIcon", maxCount: 1 },
  { name: "footerIcon", maxCount: 1 },
]);

function handleMessageError(error: unknown, res: import("express").Response): void {
  if (error instanceof MessageSendError) {
    const errorBody: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(errorBody);
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "LIMIT_FILE_SIZE"
  ) {
    const errorBody: ApiErrorBody = {
      error: "La imagen supera el límite de 5MB.",
      code: "FILE_TOO_LARGE",
    };
    res.status(400).json(errorBody);
    return;
  }

  if (error instanceof Error && /Solo PNG|máx\. 5MB/i.test(error.message)) {
    const errorBody: ApiErrorBody = {
      error: error.message,
      code: "INVALID_FILE",
    };
    res.status(400).json(errorBody);
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
  if (raw === undefined || raw === null || raw === "") return undefined;

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new MessageSendError(
        "components debe ser JSON válido.",
        400,
        "INVALID_COMPONENTS",
      );
    }
  }

  if (!Array.isArray(value)) {
    throw new MessageSendError(
      "components debe ser un array de filas.",
      400,
      "INVALID_COMPONENTS",
    );
  }

  return value.map((row, rowIndex) => {
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function firstFile(
  files: Express.Multer.File[] | undefined,
): Express.Multer.File | undefined {
  return files?.[0];
}

function optionalEmbedUpload(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    next();
    return;
  }
  embedUpload(req, res, (err: unknown) => {
    if (err) {
      handleMessageError(err, res);
      return;
    }
    next();
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
      const result = await sendTextMessage(
        bot,
        {
          channelId: body.channelId,
          content: body.content,
        },
        guildIdOf(req),
      );
      res.status(201).json(result);
    } catch (error: unknown) {
      handleMessageError(error, res);
    }
  });

  router.post("/embed", optionalEmbedUpload, async (req, res) => {
    const body = req.body as Record<string, unknown>;

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
        content: optionalString(body.content),
        title: optionalString(body.title),
        url: optionalString(body.url),
        description: optionalString(body.description),
        color: optionalString(body.color),
        authorName: optionalString(body.authorName),
        authorIconUrl: optionalString(body.authorIconUrl),
        thumbnailUrl: optionalString(body.thumbnailUrl),
        imageUrl: optionalString(body.imageUrl),
        footerText: optionalString(body.footerText),
        footerIconUrl: optionalString(body.footerIconUrl),
        timestamp: optionalBoolean(body.timestamp),
        components: parseComponents(body.components),
      };

      const uploadedMap = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;

      const uploaded: EmbedUploadedFiles = {
        image: firstFile(uploadedMap?.image),
        thumbnail: firstFile(uploadedMap?.thumbnail),
        authorIcon: firstFile(uploadedMap?.authorIcon),
        footerIcon: firstFile(uploadedMap?.footerIcon),
      };

      const result = await sendEmbedMessage(
        bot,
        payload,
        uploaded,
        guildIdOf(req),
      );
      res.status(201).json(result);
    } catch (error: unknown) {
      handleMessageError(error, res);
    }
  });

  return router;
}
