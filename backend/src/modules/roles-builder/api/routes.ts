import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  CreateGuildRoleRequest,
  RolePositionUpdate,
} from "@adobos/shared";
import {
  RolesBuilderError,
  createGuildRole,
  listGuildRoles,
  updateRolePositions,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
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

function parseCreateBody(raw: unknown): CreateGuildRoleRequest {
  const body = (raw ?? {}) as Record<string, unknown>;
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter((p): p is string => typeof p === "string")
    : undefined;

  return {
    name: typeof body.name === "string" ? body.name : "",
    color:
      typeof body.color === "string"
        ? body.color
        : body.color === null
          ? null
          : undefined,
    permissions,
    hoist: typeof body.hoist === "boolean" ? body.hoist : undefined,
    mentionable:
      typeof body.mentionable === "boolean" ? body.mentionable : undefined,
  };
}

function parsePositionsBody(raw: unknown): RolePositionUpdate[] {
  const body = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(body.positions) ? body.positions : [];
  return list
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        roleId: typeof row.roleId === "string" ? row.roleId : "",
        position: typeof row.position === "number" ? row.position : Number.NaN,
      };
    })
    .filter((row) => row.roleId);
}

/** Rutas: GET /list · POST /create · PATCH /positions (base `/api/roles`). */
export function rolesBuilderRoutes(client: Client): Router {
  const router = Router();

  router.get("/list", async (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const data = await listGuildRoles(client, guildId);
      res.json(data);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/create", async (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const input = parseCreateBody(req.body);
      const data = await createGuildRole(client, input, guildId);
      res.status(201).json(data);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.patch("/positions", async (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const positions = parsePositionsBody(req.body);
      const data = await updateRolePositions(client, positions, guildId);
      res.json(data);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
