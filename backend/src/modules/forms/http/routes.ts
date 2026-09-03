import { buildFormResponsesCsv } from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { channelBelongsToGuild } from "#core/http/channelScope.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  createForm,
  deleteForm,
  getForm,
  listFormResponses,
  listForms,
  updateForm,
} from "../domain/forms.js";
import { publishFormMessage } from "../publish.js";
import { createFormSchema, updateFormSchema } from "./schema.js";

export function formsRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      const forms = await listForms(guildIdOf(req));
      res.json({ forms });
    }),
  );

  router.post(
    "/",
    defineRoute({ body: createFormSchema }, async (req, res, valid) => {
      const form = await createForm(valid.body, guildIdOf(req));
      res.status(201).json({ form });
    }),
  );

  router.get(
    "/:id/responses.csv",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      const form = await getForm(valid.params.id, guildId);
      const responses = await listFormResponses(valid.params.id, guildId);
      const csv = buildFormResponsesCsv(form, responses);
      const safeName = (form.modalTitle || "form")
        .replace(/[^\w.-]+/g, "_")
        .slice(0, 40);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}-${valid.params.id}.csv"`,
      );
      res.send(csv);
    }),
  );

  router.get(
    "/:id/responses",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const responses = await listFormResponses(
        valid.params.id,
        guildIdOf(req),
      );
      res.json({ responses });
    }),
  );

  router.post(
    "/:id/publish",
    defineRoute(
      { params: idParams, body: updateFormSchema },
      async (req, res, valid) => {
        const result = await publishFormMessage(
          bot,
          valid.params.id,
          guildIdOf(req),
          valid.body,
        );
        res.json(result);
      },
    ),
  );

  router.get(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const form = await getForm(valid.params.id, guildIdOf(req));
      res.json({ form });
    }),
  );

  router.patch(
    "/:id",
    defineRoute(
      { params: idParams, body: updateFormSchema },
      async (req, res, valid) => {
        const form = await updateForm(
          valid.params.id,
          valid.body,
          guildIdOf(req),
        );
        res.json({ form });
      },
    ),
  );

  router.delete(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      const meta = await deleteForm(valid.params.id, guildId);
      if (bot.isReady() && meta.publishedChannelId && meta.publishedMessageId) {
        try {
          const channel = await bot.channels.fetch(meta.publishedChannelId);
          if (
            channel &&
            channelBelongsToGuild(channel, guildId) &&
            channel.isTextBased() &&
            "messages" in channel
          ) {
            await channel.messages
              .delete(meta.publishedMessageId)
              .catch(() => null);
          }
        } catch {
          /* mensaje ya borrado o sin permisos */
        }
      }
      res.status(204).send();
    }),
  );

  return router;
}
