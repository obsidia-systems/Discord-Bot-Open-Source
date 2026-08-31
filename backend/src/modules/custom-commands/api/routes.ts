import { Router } from "express";
import type { Client } from "discord.js";
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
import { parse } from "../../../core/http/validate.js";
import { logger } from "../../../core/log.js";
import {
  createCustomCommandSchema,
  recordId,
  updateCustomCommandSchema,
} from "../../../core/http/schemas.js";

function parseId(raw: string): number {
  return parse(recordId, raw);
}

async function syncSafe(bot: Client, guildId?: string): Promise<void> {
  if (!bot.isReady()) return;
  try {
    await syncGuildSlashCommands(bot, guildId);
  } catch (error) {
    logger.warn({ err: error }, "custom-commands: sync falló:");
  }
}

export function customCommandsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/custom-commands */
  router.get("/", async (req, res, next) => {
    try {
      const commands = await listCustomCommands(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/custom-commands/sync */
  router.post("/sync", async (req, res, next) => {
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
        next(error);
      }
    })();
  });

  /** POST /api/custom-commands */
  router.post("/", async (req, res, next) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const body = parse(createCustomCommandSchema, req.body ?? {});
        const command = await createCustomCommand(body, guildId);
        await syncSafe(bot, guildId);
        res.status(201).json({ command });
      } catch (error) {
        next(error);
      }
    })();
  });

  /** GET /api/custom-commands/:id */
  router.get("/:id", async (req, res, next) => {
    try {
      const command = await getCustomCommand(
        parseId(req.params.id),
        guildIdOf(req),
      );
      res.json({ command });
    } catch (error) {
      next(error);
    }
  });

  /** PATCH /api/custom-commands/:id */
  router.patch("/:id", async (req, res, next) => {
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
        next(error);
      }
    })();
  });

  /** DELETE /api/custom-commands/:id */
  router.delete("/:id", async (req, res, next) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        await deleteCustomCommand(parseId(req.params.id), guildId);
        await syncSafe(bot, guildId);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    })();
  });

  return router;
}
