import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import type { ApiErrorBody } from "@adobos/shared";
import { AutoRoleError, createAutoRoleSetup } from "./controller.js";
import { getAutoJoinRoles, saveAutoJoinRoles } from "../autoJoin.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import {
  createAutoRoleLegacySchema,
  saveAutoJoinRolesSchema,
} from "../../../core/http/schemas.js";

function handleError(
  error: unknown,
  res: import("express").Response,
  label: string,
  fallback: string,
): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof AutoRoleError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    } satisfies ApiErrorBody);
    return;
  }
  console.error(`[adobos] Error en ${label}:`, error);
  res.status(500).json({
    error: fallback,
    code: "INTERNAL_ERROR",
  } satisfies ApiErrorBody);
}

/** Rutas unificadas: /api/roles/* */
export function rolesRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/roles/auto — config de roles al unirse */
  router.get("/auto", async (req, res) => {
    try {
      res.json(await getAutoJoinRoles(guildIdOf(req)));
    } catch (error: unknown) {
      handleError(
        error,
        res,
        "GET /api/roles/auto",
        "No se pudo cargar la configuración de auto-roles.",
      );
    }
  });

  /** POST /api/roles/auto — guarda humanos/bots */
  router.post("/auto", async (req, res) => {
    try {
      const body = parse(saveAutoJoinRolesSchema, req.body);
      const result = await saveAutoJoinRoles({
        ...body,
        guildId: guildIdOf(req),
      });
      res.status(200).json(result);
    } catch (error: unknown) {
      handleError(
        error,
        res,
        "POST /api/roles/auto",
        "No se pudo guardar la configuración de auto-roles.",
      );
    }
  });

  /** POST /api/roles/interactive — menú botones/reacciones */
  router.post("/interactive", async (req, res) => {
    try {
      const payload = parse(createAutoRoleLegacySchema, req.body);
      const result = await createAutoRoleSetup(bot, {
        ...payload,
        guildId: guildIdOf(req),
      });
      res.status(201).json(result);
    } catch (error: unknown) {
      handleError(
        error,
        res,
        "POST /api/roles/interactive",
        "No se pudo publicar el menú interactivo.",
      );
    }
  });

  return router;
}
