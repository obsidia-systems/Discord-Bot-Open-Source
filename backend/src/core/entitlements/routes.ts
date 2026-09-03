import { Router } from "express";
import { guildIdOf } from "../http/guildContext.js";
import { getGuildEntitlements } from "./service.js";

/** GET /api/entitlements — plan, features y límites del servidor autorizado. */
export function entitlementsRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    res.json(await getGuildEntitlements(guildIdOf(req)));
  });

  return router;
}
