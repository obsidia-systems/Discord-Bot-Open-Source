import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  UpdateAutoDeleteConfigRequest,
} from "@adobos/shared";
import { resolveSchedulerTimezone } from "../../../lib/schedulerTimezone.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import {
  AutoDeleteError,
  getAutoDeleteConfig,
  updateAutoDeleteConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof AutoDeleteError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/auto-delete:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Auto-delete.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function autoDeleteRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/auto-delete/config */
  router.get("/config", (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const config = getAutoDeleteConfig(guildId);
      res.json({ config, timezone: resolveSchedulerTimezone() });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/auto-delete/config */
  router.post("/config", (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const body = (req.body ?? {}) as UpdateAutoDeleteConfigRequest;
      const config = updateAutoDeleteConfig(body, guildId);
      res.json({ config, timezone: resolveSchedulerTimezone() });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
