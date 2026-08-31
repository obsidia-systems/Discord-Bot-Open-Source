import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  CreateFormRequest,
  UpdateFormRequest,
} from "@adobos/shared";
import { publishFormMessage } from "../publish.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { channelBelongsToGuild } from "../../../core/http/channelScope.js";
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
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) {
    throw new FormsError("ID de formulario inválido.", 400, "INVALID_ID");
  }
  return id;
}

export function formsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/forms */
  router.get("/", (req, res) => {
    try {
      const forms = listForms(guildIdOf(req));
      res.json({ forms });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/forms */
  router.post("/", (req, res) => {
    try {
      const body = (req.body ?? {}) as CreateFormRequest;
      const form = createForm(body, guildIdOf(req));
      res.status(201).json({ form });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/forms/:id/responses — antes de /:id genérico */
  router.get("/:id/responses", (req, res) => {
    try {
      const formId = parseFormId(req.params.id);
      const responses = listFormResponses(formId, guildIdOf(req));
      res.json({ responses });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/forms/:id/publish */
  router.post("/:id/publish", (req, res) => {
    void (async () => {
      try {
        const formId = parseFormId(req.params.id);
        const body = (req.body ?? {}) as UpdateFormRequest;
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
  router.get("/:id", (req, res) => {
    try {
      const formId = parseFormId(req.params.id);
      const form = getForm(formId, guildIdOf(req));
      res.json({ form });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PATCH /api/forms/:id */
  router.patch("/:id", (req, res) => {
    try {
      const formId = parseFormId(req.params.id);
      const body = (req.body ?? {}) as UpdateFormRequest;
      const form = updateForm(formId, body, guildIdOf(req));
      res.json({ form });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** DELETE /api/forms/:id */
  router.delete("/:id", (req, res) => {
    void (async () => {
      try {
        const formId = parseFormId(req.params.id);
        const meta = deleteForm(formId, guildIdOf(req));
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
