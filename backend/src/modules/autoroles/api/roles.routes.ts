import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { getAutoJoinRoles, saveAutoJoinRoles } from "../autoJoin.js";
import { createAutoRoleSetup } from "./controller.js";
import {
  createAutoRoleLegacySchema,
  saveAutoJoinRolesSchema,
} from "./schema.js";

/** Rutas unificadas: /api/roles/* */
export function rolesRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/roles/auto — config de roles al unirse */
  router.get(
    "/auto",
    defineRoute({}, async (req, res) => {
      res.json(await getAutoJoinRoles(guildIdOf(req)));
    }),
  );

  /** POST /api/roles/auto — guarda humanos/bots */
  router.post(
    "/auto",
    defineRoute({ body: saveAutoJoinRolesSchema }, async (req, res, valid) => {
      const result = await saveAutoJoinRoles(
        { ...valid.body, guildId: guildIdOf(req) },
        bot,
      );
      res.status(200).json(result);
    }),
  );

  /** POST /api/roles/interactive — menú botones/reacciones */
  router.post(
    "/interactive",
    defineRoute(
      { body: createAutoRoleLegacySchema },
      async (req, res, valid) => {
        const result = await createAutoRoleSetup(bot, {
          ...valid.body,
          guildId: guildIdOf(req),
        });
        res.status(201).json(result);
      },
    ),
  );

  return router;
}
