import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  SystemCommandsError,
  listSystemCommandConfigs,
  updateSystemCommandPermissions,
} from "../service.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import { updateSystemCommandsSchema } from "../../../core/http/schemas.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof SystemCommandsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/system-commands:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Comandos del Sistema.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function systemCommandsRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/system-commands */
  router.get("/", async (req, res) => {
    try {
      const commands = await listSystemCommandConfigs(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/system-commands — permisos por guild (el registro Discord es global). */
  router.put("/", async (req, res) => {
    void (async () => {
      try {
        const body = parse(updateSystemCommandsSchema, req.body);
        const guildId = guildIdOf(req);
        const commands = await updateSystemCommandPermissions(body, guildId);
        res.json({ commands });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
