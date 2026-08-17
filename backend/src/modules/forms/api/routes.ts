import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  UpdateFormsConfigRequest,
} from "@adobos/shared";
import { publishFormsMessage } from "../publish.js";
import {
  FormsError,
  getFormsConfig,
  updateFormsConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof FormsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/forms:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Formularios.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function formsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/forms/config */
  router.get("/config", (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const config = getFormsConfig(guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/forms/config */
  router.post("/config", (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const body = (req.body ?? {}) as UpdateFormsConfigRequest;
      const config = updateFormsConfig(body, guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/forms/publish */
  router.post("/publish", (req, res) => {
    void (async () => {
      try {
        const guildId =
          typeof req.body?.guildId === "string"
            ? req.body.guildId
            : typeof req.query.guildId === "string"
              ? req.query.guildId
              : undefined;
        const body = (req.body ?? {}) as UpdateFormsConfigRequest;
        const result = await publishFormsMessage(bot, guildId, body);
        res.json(result);
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
