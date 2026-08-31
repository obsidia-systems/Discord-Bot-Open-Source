import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody, UpdatePokemonConfigRequest } from "@adobos/shared";
import { guildIdOf } from "../../../core/http/guildContext.js";
import {
  PokemonError,
  getPokemonConfig,
  updatePokemonConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof PokemonError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/pokemon:", error);
  const body: ApiErrorBody = {
    error: "Error interno en el plugin Pokémon.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function pokemonRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/pokemon/config */
  router.get("/config", async (req, res) => {
    try {
      const config = await getPokemonConfig(guildIdOf(req));
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/pokemon/config */
  router.put("/config", async (req, res) => {
    try {
      const body = (req.body ?? {}) as UpdatePokemonConfigRequest;
      const config = await updatePokemonConfig({
        ...body,
        guildId: guildIdOf(req) ?? body.guildId,
      });
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
