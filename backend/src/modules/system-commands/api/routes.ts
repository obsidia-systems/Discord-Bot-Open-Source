import { Router } from "express";
import type {
  ApiErrorBody,
  UpdateSystemCommandsRequest,
} from "@adobos/shared";
import {
  SystemCommandsError,
  listSystemCommandConfigs,
  updateSystemCommandPermissions,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
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

function resolveGuildId(req: {
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | undefined {
  if (typeof req.body?.guildId === "string") return req.body.guildId;
  if (typeof req.query.guildId === "string") return req.query.guildId;
  return undefined;
}

export function systemCommandsRoutes(): Router {
  const router = Router();

  /** GET /api/system-commands */
  router.get("/", (req, res) => {
    try {
      const commands = listSystemCommandConfigs(resolveGuildId(req));
      res.json({ commands });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/system-commands */
  router.put("/", (req, res) => {
    try {
      const body = req.body as UpdateSystemCommandsRequest;
      const commands = updateSystemCommandPermissions(
        body,
        resolveGuildId(req),
      );
      res.json({ commands });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
