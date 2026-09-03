import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  deleteReminder,
  listRemindersConfig,
  updateReminderSettings,
} from "../service.js";
import { updateReminderSettingsSchema } from "./schema.js";

export function remindersRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await listRemindersConfig(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/settings", async (req, res, next) => {
    try {
      const body = parse(updateReminderSettingsSchema, req.body ?? {});
      const settings = await updateReminderSettings(body, guildIdOf(req));
      res.json({ settings });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      await deleteReminder(id, guildIdOf(req), undefined, true);
      res.status(204).send();
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
