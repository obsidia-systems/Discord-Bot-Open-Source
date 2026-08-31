import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  UpdateSystemCommandsRequest,
} from "@adobos/shared";
import {
  SystemCommandsError,
  listSystemCommandConfigs,
  updateSystemCommandPermissions,
} from "../service.js";
import { syncGuildSlashCommands } from "../../custom-commands/sync.js";
import { guildIdOf } from "../../../core/http/guildContext.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof SystemCommandsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/system-commands:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Comandos del Sistema.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function systemCommandsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/system-commands */
  router.get("/", (req, res) => {
    try {
      const commands = listSystemCommandConfigs(guildIdOf(req));
      res.json({ commands });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/system-commands — guarda permisos y re-sincroniza slash en Discord. */
  router.put("/", (req, res) => {
    void (async () => {
      try {
        const body = req.body as UpdateSystemCommandsRequest;
        const guildId = guildIdOf(req);
        const commands = updateSystemCommandPermissions(body, guildId);
        if (bot.isReady()) {
          try {
            await syncGuildSlashCommands(bot, guildId);
          } catch (error) {
            console.warn(
              "[adobos] system-commands: sync Discord tras guardar falló:",
              error,
            );
          }
        }
        res.json({ commands });
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
