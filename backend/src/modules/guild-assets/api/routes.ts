import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  GuildAssetsError,
  getGuildAssets,
} from "./controller.js";

export function guildAssetsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/guild-assets?guildId=optional */
  router.get("/", async (req, res) => {
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;

    try {
      const assets = await getGuildAssets(bot, guildId);
      res.json(assets);
    } catch (error: unknown) {
      if (error instanceof GuildAssetsError) {
        const body: ApiErrorBody = {
          error: error.message,
          code: error.code,
        };
        res.status(error.status).json(body);
        return;
      }

      console.error("[adobos] Error en GET /api/guild-assets:", error);
      const body: ApiErrorBody = {
        error: "No se pudieron obtener los assets del servidor.",
        code: "INTERNAL_ERROR",
      };
      res.status(500).json(body);
    }
  });

  return router;
}
