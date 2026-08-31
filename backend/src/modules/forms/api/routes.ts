import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import { publishFormMessage } from "../publish.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { channelBelongsToGuild } from "../../../core/http/channelScope.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import { createFormSchema, recordId, updateFormSchema } from "../../../core/http/schemas.js";
import {
  FormsError,
  createForm,
  deleteForm,
  getForm,
  listFormResponses,
  listForms,
  updateForm,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof FormsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/forms:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Formularios.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

function parseFormId(raw: string): number {
  return parse(recordId, raw);
}

export function formsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/forms */
  router.get("/", async (req, res) => {
    try {
      const forms = await listForms(guildIdOf(req));
      res.json({ forms });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/forms */
  router.post("/", async (req, res) => {
    try {
      const body = parse(createFormSchema, req.body ?? {});
      const form = await createForm(body, guildIdOf(req));
      res.status(201).json({ form });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/forms/:id/responses — antes de /:id genérico */
  router.get("/:id/responses", async (req, res) => {
    try {
      const formId = parseFormId(req.params.id);
      const responses = await listFormResponses(formId, guildIdOf(req));
      res.json({ responses });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/forms/:id/publish */
  router.post("/:id/publish", async (req, res) => {
    void (async () => {
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
        handleError(error, res);
      }
    })();
  });

  /** GET /api/forms/:id */
  router.get("/:id", async (req, res) => {
    try {
      const formId = parseFormId(req.params.id);
      const form = await getForm(formId, guildIdOf(req));
      res.json({ form });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PATCH /api/forms/:id */
  router.patch("/:id", async (req, res) => {
    try {
      const formId = parseFormId(req.params.id);
      const body = parse(updateFormSchema, req.body ?? {});
      const form = await updateForm(formId, body, guildIdOf(req));
      res.json({ form });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** DELETE /api/forms/:id */
  router.delete("/:id", async (req, res) => {
    void (async () => {
      try {
        const formId = parseFormId(req.params.id);
        const meta = await deleteForm(formId, guildIdOf(req));
        if (
          bot.isReady() &&
          meta.publishedChannelId &&
          meta.publishedMessageId
        ) {
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
        handleError(error, res);
      }
    })();
  });

  return router;
}
