import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  CanvasEventType,
  SaveCanvasEventSettingsRequest,
} from "@adobos/shared";
import {
  CanvasEventSettingsError,
  getCanvasEventSettings,
  saveCanvasEventSettings,
} from "../service.js";

function handleError(
  error: unknown,
  res: import("express").Response,
  label: string,
): void {
  if (error instanceof CanvasEventSettingsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }

  console.error(`[adobos] Error en /api/bot/${label}:`, error);
  const body: ApiErrorBody = {
    error: "No se pudo procesar la configuración.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function canvasEventSettingsRoutes(
  eventType: CanvasEventType,
  _bot: Client,
): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;

    try {
      res.json(getCanvasEventSettings(eventType, guildId));
    } catch (error: unknown) {
      handleError(error, res, eventType);
    }
  });

  router.post("/", (req, res) => {
    try {
      const payload = req.body as SaveCanvasEventSettingsRequest;
      const result = saveCanvasEventSettings(eventType, payload);
      res.json(result);
    } catch (error: unknown) {
      handleError(error, res, eventType);
    }
  });

  return router;
}
