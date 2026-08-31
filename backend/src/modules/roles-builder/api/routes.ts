import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import {
  createGuildRoleSchema,
  updateRolePositionsSchema,
} from "../../../core/http/schemas.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  RolesBuilderError,
  createGuildRole,
  listGuildRoles,
  updateRolePositions,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof RolesBuilderError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }

  console.error("[adobos] Error en /api/roles (roles-builder):", error);
  const body: ApiErrorBody = {
    error: "Error interno en Fabricador de Roles.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

/** Rutas: GET /list · POST /create · PATCH /positions (base `/api/roles`). */
export function rolesBuilderRoutes(client: Client): Router {
  const router = Router();

  router.get("/list", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const data = await listGuildRoles(client, guildId);
      res.json(data);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/create", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const input = parse(createGuildRoleSchema, req.body);
      const data = await createGuildRole(client, input, guildId);
      res.status(201).json(data);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch("/positions", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const { positions } = parse(updateRolePositionsSchema, req.body);
      const data = await updateRolePositions(client, positions, guildId);
      res.json(data);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
