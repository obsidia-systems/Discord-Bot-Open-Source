import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  CustomCommandsError,
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommand,
  listCustomCommands,
  updateCustomCommand,
} from "../service.js";
import { syncGuildSlashCommands } from "../sync.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import {
  createCustomCommandSchema,
  recordId,
  updateCustomCommandSchema,
} from "../../../core/http/schemas.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof CustomCommandsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/custom-commands:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Comandos custom.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

function parseId(raw: string): number {
  return parse(recordId, raw);
}

async function syncSafe(bot: Client, guildId?: string): Promise<void> {
  if (!bot.isReady()) return;
  try {
    await syncGuildSlashCommands(bot, guildId);
  } catch (error) {
    console.warn("[adobos] custom-commands: sync falló:", error);
  }
}

export function customCommandsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/custom-commands */
  router.get("/", async (req, res) => {
    try {
      const commands = await listCustomCommands(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/custom-commands/sync */
  router.post("/sync", async (req, res) => {
    void (async () => {
      try {
        if (!bot.isReady()) {
          throw new CustomCommandsError(
            "El bot no está conectado.",
            503,
            "BOT_NOT_READY",
          );
        }
        const count = await syncGuildSlashCommands(
          bot,
          guildIdOf(req),
        );
        res.json({ ok: true, count });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** POST /api/custom-commands */
  router.post("/", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = parse(createCustomCommandSchema, req.body ?? {});
        const command = await createCustomCommand(body, guildId);
        await syncSafe(bot, guildId);
        res.status(201).json({ command });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** GET /api/custom-commands/:id */
  router.get("/:id", async (req, res) => {
    try {
      const command = await getCustomCommand(
        parseId(req.params.id),
        guildIdOf(req),
      );
      res.json({ command });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PATCH /api/custom-commands/:id */
  router.patch("/:id", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = parse(updateCustomCommandSchema, req.body ?? {});
        const command = await updateCustomCommand(
          parseId(req.params.id),
          body,
          guildId,
        );
        await syncSafe(bot, guildId);
        res.json({ command });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** DELETE /api/custom-commands/:id */
  router.delete("/:id", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        await deleteCustomCommand(parseId(req.params.id), guildId);
        await syncSafe(bot, guildId);
        res.status(204).send();
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
