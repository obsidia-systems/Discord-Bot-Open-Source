import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  CreateCustomCommandRequest,
  UpdateCustomCommandRequest,
} from "@adobos/shared";
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

function handleError(error: unknown, res: import("express").Response): void {
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
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) {
    throw new CustomCommandsError("ID inválido.", 400, "INVALID_ID");
  }
  return id;
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
  router.get("/", (req, res) => {
    try {
      const commands = listCustomCommands(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/custom-commands/sync */
  router.post("/sync", (req, res) => {
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
  router.post("/", (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = (req.body ?? {}) as CreateCustomCommandRequest;
        const command = createCustomCommand(body, guildId);
        await syncSafe(bot, guildId);
        res.status(201).json({ command });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** GET /api/custom-commands/:id */
  router.get("/:id", (req, res) => {
    try {
      const command = getCustomCommand(
        parseId(req.params.id),
        guildIdOf(req),
      );
      res.json({ command });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PATCH /api/custom-commands/:id */
  router.patch("/:id", (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = (req.body ?? {}) as UpdateCustomCommandRequest;
        const command = updateCustomCommand(
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
  router.delete("/:id", (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        deleteCustomCommand(parseId(req.params.id), guildId);
        await syncSafe(bot, guildId);
        res.status(204).send();
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
