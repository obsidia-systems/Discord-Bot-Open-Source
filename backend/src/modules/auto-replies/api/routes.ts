import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  createAutoReply,
  deleteAutoReply,
  listAutoRepliesConfig,
  updateAutoReply,
} from "../service.js";
import { createAutoReplySchema, updateAutoReplySchema } from "./schema.js";

export function autoRepliesRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await listAutoRepliesConfig(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const reply = await createAutoReply(
        parse(createAutoReplySchema, req.body ?? {}),
        guildIdOf(req),
      );
      res.status(201).json({ reply });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      const reply = await updateAutoReply(
        id,
        parse(updateAutoReplySchema, req.body ?? {}),
        guildIdOf(req),
      );
      res.json({ reply });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      await deleteAutoReply(id, guildIdOf(req));
      res.status(204).send();
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
