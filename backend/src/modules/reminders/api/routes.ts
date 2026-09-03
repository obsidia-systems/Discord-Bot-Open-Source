import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  deleteReminder,
  listRemindersConfig,
  updateReminderSettings,
} from "../service.js";
import { updateReminderSettingsSchema } from "./schema.js";

export function remindersRoutes(): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await listRemindersConfig(guildIdOf(req)));
    }),
  );

  router.patch(
    "/settings",
    defineRoute(
      { body: updateReminderSettingsSchema },
      async (req, res, valid) => {
        const settings = await updateReminderSettings(
          valid.body,
          guildIdOf(req),
        );
        res.json({ settings });
      },
    ),
  );

  router.delete(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      await deleteReminder(valid.params.id, guildIdOf(req), undefined, true);
      res.status(204).send();
    }),
  );

  return router;
}
