import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import type {
  ApiErrorBody,
  UpdateAutoModConfigRequest,
} from "@adobos/shared";
import {
  AutoModError,
  getAutoModConfig,
  updateAutoModConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof AutoModError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/auto-mod:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Auto Mod.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function autoModRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/auto-mod/config */
  router.get("/config", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const config = await getAutoModConfig(guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/auto-mod/config */
  router.post("/config", async (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const body = (req.body ?? {}) as UpdateAutoModConfigRequest;
      const config = await updateAutoModConfig(body, guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
