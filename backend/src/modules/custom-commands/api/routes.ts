import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  CustomCommandsError,
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommand,
  listCustomCommands,
  setCustomCommandActive,
  updateCustomCommand,
} from "../service.js";
import { syncGuildSlashCommands } from "../sync.js";
import {
  createCustomCommandSchema,
  toggleCustomCommandSchema,
  updateCustomCommandSchema,
} from "./schema.js";

function parseId(raw: string): number {
  return parse(recordId, raw);
}

async function syncOrThrow(bot: Client, guildId: string): Promise<number> {
  if (!bot.isReady()) {
    throw new CustomCommandsError(
      "The bot is not connected. The command was saved; use Re-sync when the bot is ready.",
      503,
      "BOT_NOT_READY",
    );
  }
  return await syncGuildSlashCommands(bot, guildId);
}

function isSyncSoftFail(error: unknown): error is CustomCommandsError {
  return (
    error instanceof CustomCommandsError &&
    (error.code === "SYNC_FAILED" || error.code === "BOT_NOT_READY")
  );
}

export function customCommandsRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const commands = await listCustomCommands(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sync", async (req, res, next) => {
    try {
      const count = await syncOrThrow(bot, guildIdOf(req));
      res.json({ ok: true, count });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(createCustomCommandSchema, req.body ?? {});
      const command = await createCustomCommand(body, guildId);
      try {
        const count = await syncOrThrow(bot, guildId);
        res.status(201).json({ command, synced: true, count });
      } catch (error) {
        if (isSyncSoftFail(error)) {
          res.status(201).json({
            command,
            synced: false,
            warning: error.message,
          });
          return;
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

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

  router.patch("/:id", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateCustomCommandSchema, req.body ?? {});
      const command = await updateCustomCommand(
        parseId(req.params.id),
        body,
        guildId,
      );
      try {
        await syncOrThrow(bot, guildId);
        res.json({ command, synced: true });
      } catch (error) {
        if (isSyncSoftFail(error)) {
          res.json({ command, synced: false, warning: error.message });
          return;
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/toggle", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const { isActive } = parse(toggleCustomCommandSchema, req.body ?? {});
      const command = await setCustomCommandActive(
        parseId(req.params.id),
        isActive,
        guildId,
      );
      try {
        await syncOrThrow(bot, guildId);
        res.json({ command, synced: true });
      } catch (error) {
        if (isSyncSoftFail(error)) {
          res.json({ command, synced: false, warning: error.message });
          return;
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      await deleteCustomCommand(parseId(req.params.id), guildId);
      await syncOrThrow(bot, guildId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
