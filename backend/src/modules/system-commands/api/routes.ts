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

function resolveGuildId(req: {
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | undefined {
  if (typeof req.body?.guildId === "string") return req.body.guildId;
  if (typeof req.query.guildId === "string") return req.query.guildId;
  return undefined;
}

export function systemCommandsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/system-commands */
  router.get("/", (req, res) => {
    try {
      const commands = listSystemCommandConfigs(resolveGuildId(req));
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
        const guildId = resolveGuildId(req);
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
