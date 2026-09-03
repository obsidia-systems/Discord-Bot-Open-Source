import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import {
  listSystemCommandConfigs,
  updateSystemCommandPermissions,
} from "../service.js";
import { updateSystemCommandsSchema } from "./schema.js";

export function systemCommandsRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/system-commands */
  router.get("/", async (req, res, next) => {
    try {
      const commands = await listSystemCommandConfigs(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      next(error);
    }
  });

  /** PUT /api/system-commands — permisos por guild (el registro Discord es global). */
  router.put("/", async (req, res, next) => {
    try {
      const body = parse(updateSystemCommandsSchema, req.body);
      const guildId = guildIdOf(req);
      const commands = await updateSystemCommandPermissions(body, guildId);
      res.json({ commands });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
