import { Router } from "express";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  CustomCommandsError,
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommand,
  listCustomCommands,
  setCustomCommandActive,
  updateCustomCommand,
} from "../domain/custom-commands.js";
import { syncGuildSlashCommands } from "../sync.js";
import {
  createCustomCommandSchema,
  toggleCustomCommandSchema,
  updateCustomCommandSchema,
} from "./schema.js";

async function syncOrThrow(
  gateway: BotGateway,
  guildId: string,
): Promise<number> {
  if (!gateway.isReady()) {
    throw new CustomCommandsError(
      "The bot is not connected. The command was saved; use Re-sync when the bot is ready.",
      503,
      "BOT_NOT_READY",
    );
  }
  return await syncGuildSlashCommands(guildId);
}

function isSyncSoftFail(error: unknown): error is CustomCommandsError {
  return (
    error instanceof CustomCommandsError &&
    (error.code === "SYNC_FAILED" || error.code === "BOT_NOT_READY")
  );
}

export function customCommandsRoutes(gateway: BotGateway): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      const commands = await listCustomCommands(guildIdOf(req));
      res.json({ commands });
    }),
  );

  router.post(
    "/sync",
    defineRoute({}, async (req, res) => {
      const count = await syncOrThrow(gateway, guildIdOf(req));
      res.json({ ok: true, count });
    }),
  );

  router.post(
    "/",
    defineRoute(
      { body: createCustomCommandSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        const command = await createCustomCommand(valid.body, guildId);
        try {
          const count = await syncOrThrow(gateway, guildId);
          res.status(201).json({ command, synced: true, count });
        } catch (error) {
          if (isSyncSoftFail(error)) {
            res
              .status(201)
              .json({ command, synced: false, warning: error.message });
            return;
          }
          throw error;
        }
      },
    ),
  );

  router.get(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const command = await getCustomCommand(valid.params.id, guildIdOf(req));
      res.json({ command });
    }),
  );

  router.patch(
    "/:id",
    defineRoute(
      { params: idParams, body: updateCustomCommandSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        const command = await updateCustomCommand(
          valid.params.id,
          valid.body,
          guildId,
        );
        try {
          await syncOrThrow(gateway, guildId);
          res.json({ command, synced: true });
        } catch (error) {
          if (isSyncSoftFail(error)) {
            res.json({ command, synced: false, warning: error.message });
            return;
          }
          throw error;
        }
      },
    ),
  );

  router.post(
    "/:id/toggle",
    defineRoute(
      { params: idParams, body: toggleCustomCommandSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        const command = await setCustomCommandActive(
          valid.params.id,
          valid.body.isActive,
          guildId,
        );
        try {
          await syncOrThrow(gateway, guildId);
          res.json({ command, synced: true });
        } catch (error) {
          if (isSyncSoftFail(error)) {
            res.json({ command, synced: false, warning: error.message });
            return;
          }
          throw error;
        }
      },
    ),
  );

  router.delete(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      await deleteCustomCommand(valid.params.id, guildId);
      await syncOrThrow(gateway, guildId);
      res.status(204).send();
    }),
  );

  return router;
}
