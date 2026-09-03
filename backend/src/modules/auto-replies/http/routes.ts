import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  createAutoReply,
  deleteAutoReply,
  listAutoRepliesConfig,
  updateAutoReply,
} from "../domain/auto-replies.js";
import { createAutoReplySchema, updateAutoReplySchema } from "./schema.js";

export function autoRepliesRoutes(): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await listAutoRepliesConfig(guildIdOf(req)));
    }),
  );

  router.post(
    "/",
    defineRoute({ body: createAutoReplySchema }, async (req, res, valid) => {
      const reply = await createAutoReply(valid.body, guildIdOf(req));
      res.status(201).json({ reply });
    }),
  );

  router.patch(
    "/:id",
    defineRoute(
      { params: idParams, body: updateAutoReplySchema },
      async (req, res, valid) => {
        const reply = await updateAutoReply(
          valid.params.id,
          valid.body,
          guildIdOf(req),
        );
        res.json({ reply });
      },
    ),
  );

  router.delete(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      await deleteAutoReply(valid.params.id, guildIdOf(req));
      res.status(204).send();
    }),
  );

  return router;
}
