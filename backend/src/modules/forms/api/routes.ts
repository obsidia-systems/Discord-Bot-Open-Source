import { buildFormResponsesCsv } from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { channelBelongsToGuild } from "../../../core/http/channelScope.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import { publishFormMessage } from "../publish.js";
import {
  createForm,
  deleteForm,
  getForm,
  listFormResponses,
  listForms,
  updateForm,
} from "../service.js";
import { createFormSchema, updateFormSchema } from "./schema.js";

function parseFormId(raw: string): number {
  return parse(recordId, raw);
}

export function formsRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const forms = await listForms(guildIdOf(req));
      res.json({ forms });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const body = parse(createFormSchema, req.body ?? {});
      const form = await createForm(body, guildIdOf(req));
      res.status(201).json({ form });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/responses.csv", async (req, res, next) => {
    try {
      const formId = parseFormId(req.params.id);
      const guildId = guildIdOf(req);
      const form = await getForm(formId, guildId);
      const responses = await listFormResponses(formId, guildId);
      const csv = buildFormResponsesCsv(form, responses);
      const safeName = (form.modalTitle || "form")
        .replace(/[^\w.-]+/g, "_")
        .slice(0, 40);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}-${formId}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/responses", async (req, res, next) => {
    try {
      const formId = parseFormId(req.params.id);
      const responses = await listFormResponses(formId, guildIdOf(req));
      res.json({ responses });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/publish", async (req, res, next) => {
    try {
      const formId = parseFormId(req.params.id);
      const body = parse(updateFormSchema, req.body ?? {});
      const result = await publishFormMessage(
        bot,
        formId,
        guildIdOf(req),
        body,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const formId = parseFormId(req.params.id);
      const form = await getForm(formId, guildIdOf(req));
      res.json({ form });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const formId = parseFormId(req.params.id);
      const body = parse(updateFormSchema, req.body ?? {});
      const form = await updateForm(formId, body, guildIdOf(req));
      res.json({ form });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const formId = parseFormId(req.params.id);
      const meta = await deleteForm(formId, guildIdOf(req));
      if (bot.isReady() && meta.publishedChannelId && meta.publishedMessageId) {
        try {
          const channel = await bot.channels.fetch(meta.publishedChannelId);
          if (
            channel &&
            channelBelongsToGuild(channel, guildIdOf(req)) &&
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
    } catch (error) {
      next(error);
    }
  });

  return router;
}
