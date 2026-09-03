import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { snowflake } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  createGuildRole,
  deleteGuildRole,
  listGuildRoles,
  updateGuildRole,
  updateRolePositions,
} from "../service.js";
import {
  createGuildRoleSchema,
  updateGuildRoleSchema,
  updateRolePositionsSchema,
} from "./schema.js";

/** Rutas: GET /list · POST /create · PATCH /positions · PATCH|DELETE /:roleId. */
export function rolesBuilderRoutes(client: Client): Router {
  const router = Router();

  router.get("/list", async (req, res, next) => {
    try {
      const data = await listGuildRoles(client, guildIdOf(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.post("/create", async (req, res, next) => {
    try {
      const input = parse(createGuildRoleSchema, req.body);
      const data = await createGuildRole(client, input, guildIdOf(req));
      res.status(201).json(data);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/positions", async (req, res, next) => {
    try {
      const { positions } = parse(updateRolePositionsSchema, req.body);
      const data = await updateRolePositions(client, positions, guildIdOf(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:roleId", async (req, res, next) => {
    try {
      const roleId = parse(snowflake, req.params.roleId);
      const input = parse(updateGuildRoleSchema, req.body ?? {});
      const data = await updateGuildRole(client, roleId, input, guildIdOf(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:roleId", async (req, res, next) => {
    try {
      const roleId = parse(snowflake, req.params.roleId);
      const data = await deleteGuildRole(client, roleId, guildIdOf(req));
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
