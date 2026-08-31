import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { createAutoRoleSetup } from "./controller.js";
import { getAutoJoinRoles, saveAutoJoinRoles } from "../autoJoin.js";
import { parse } from "../../../core/http/validate.js";
import {
  createAutoRoleLegacySchema,
  saveAutoJoinRolesSchema,
} from "../../../core/http/schemas.js";

/** Rutas unificadas: /api/roles/* */
export function rolesRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/roles/auto — config de roles al unirse */
  router.get("/auto", async (req, res, next) => {
    try {
      res.json(await getAutoJoinRoles(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  /** POST /api/roles/auto — guarda humanos/bots */
  router.post("/auto", async (req, res, next) => {
    try {
      const body = parse(saveAutoJoinRolesSchema, req.body);
      const result = await saveAutoJoinRoles({
        ...body,
        guildId: guildIdOf(req),
      });
      res.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** POST /api/roles/interactive — menú botones/reacciones */
  router.post("/interactive", async (req, res, next) => {
    try {
      const payload = parse(createAutoRoleLegacySchema, req.body);
      const result = await createAutoRoleSetup(bot, {
        ...payload,
        guildId: guildIdOf(req),
      });
      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
