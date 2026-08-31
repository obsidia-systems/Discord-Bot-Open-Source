import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import {
  createGuildRoleSchema,
  updateRolePositionsSchema,
} from "../../../core/http/schemas.js";
import {
  createGuildRole,
  listGuildRoles,
  updateRolePositions,
} from "../service.js";

/** Rutas: GET /list · POST /create · PATCH /positions (base `/api/roles`). */
export function rolesBuilderRoutes(client: Client): Router {
  const router = Router();

  router.get("/list", async (req, res, next) => {
    try {
      const guildId =
        guildIdOf(req);
      const data = await listGuildRoles(client, guildId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.post("/create", async (req, res, next) => {
    try {
      const guildId =
        guildIdOf(req);
      const input = parse(createGuildRoleSchema, req.body);
      const data = await createGuildRole(client, input, guildId);
      res.status(201).json(data);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/positions", async (req, res, next) => {
    try {
      const guildId =
        guildIdOf(req);
      const { positions } = parse(updateRolePositionsSchema, req.body);
      const data = await updateRolePositions(client, positions, guildId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
