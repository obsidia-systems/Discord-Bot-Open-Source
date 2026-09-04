import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import {
  listSystemCommandConfigs,
  updateSystemCommandPermissions,
} from "../domain/system-commands.js";
import { updateSystemCommandsSchema } from "./schema.js";

export function systemCommandsRoutes(): Router {
  const router = Router();

  /** GET /api/system-commands */
  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      const commands = await listSystemCommandConfigs(guildIdOf(req));
      res.json({ commands });
    }),
  );

  /** PUT /api/system-commands — permisos por guild (el registro Discord es global). */
  router.put(
    "/",
    defineRoute(
      { body: updateSystemCommandsSchema },
      async (req, res, valid) => {
        const commands = await updateSystemCommandPermissions(
          valid.body,
          guildIdOf(req),
        );
        res.json({ commands });
      },
    ),
  );

  return router;
}
