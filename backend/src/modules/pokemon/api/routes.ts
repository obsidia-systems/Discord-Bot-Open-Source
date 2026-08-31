import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { updatePokemonConfigSchema } from "../../../core/http/schemas.js";
import {
  getPokemonConfig,
  updatePokemonConfig,
} from "../service.js";

export function pokemonRoutes(_bot: Client): Router {
  const router = Router();

  /** GET /api/pokemon/config */
  router.get("/config", async (req, res, next) => {
    try {
      const config = await getPokemonConfig(guildIdOf(req));
      res.json({ config });
    } catch (error) {
      next(error);
    }
  });

  /** PUT /api/pokemon/config */
  router.put("/config", async (req, res, next) => {
    try {
      const body = parse(updatePokemonConfigSchema, req.body ?? {});
      const config = await updatePokemonConfig({
        ...body,
        guildId: guildIdOf(req),
      });
      res.json({ config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
