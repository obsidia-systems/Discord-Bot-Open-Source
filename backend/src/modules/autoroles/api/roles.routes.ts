import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import type {
  ApiErrorBody,
  CreateAutoRoleRequest,
  SaveAutoJoinRolesRequest,
} from "@adobos/shared";
import {
  AutoRoleError,
  createAutoRoleSetup,
} from "./controller.js";
import {
  getAutoJoinRoles,
  saveAutoJoinRoles,
} from "../autoJoin.js";

function parseRoleIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

/** Rutas unificadas: /api/roles/* */
export function rolesRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/roles/auto — config de roles al unirse */
  router.get("/auto", (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      res.json(getAutoJoinRoles(guildId));
    } catch (error: unknown) {
      if (error instanceof AutoRoleError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
        } satisfies ApiErrorBody);
        return;
      }
      console.error("[adobos] Error en GET /api/roles/auto:", error);
      res.status(500).json({
        error: "No se pudo cargar la configuración de auto-roles.",
        code: "INTERNAL_ERROR",
      } satisfies ApiErrorBody);
    }
  });

  /** POST /api/roles/auto — guarda humanos/bots */
  router.post("/auto", (req, res) => {
    const body = req.body as Partial<SaveAutoJoinRolesRequest>;
    try {
      const payload: SaveAutoJoinRolesRequest = {
        guildId: typeof body.guildId === "string" ? body.guildId : undefined,
        humanRoles: parseRoleIdArray(body.humanRoles),
        botRoles: parseRoleIdArray(body.botRoles),
      };
      const result = saveAutoJoinRoles(payload);
      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof AutoRoleError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
        } satisfies ApiErrorBody);
        return;
      }
      console.error("[adobos] Error en POST /api/roles/auto:", error);
      res.status(500).json({
        error: "No se pudo guardar la configuración de auto-roles.",
        code: "INTERNAL_ERROR",
      } satisfies ApiErrorBody);
    }
  });

  /** POST /api/roles/interactive — menú botones/reacciones */
  router.post("/interactive", async (req, res) => {
    const body = req.body as Partial<CreateAutoRoleRequest>;

    if (
      (body.mode !== "buttons" && body.mode !== "reactions") ||
      typeof body.guildId !== "string" ||
      typeof body.channelId !== "string" ||
      (body.messageSource !== "existing" && body.messageSource !== "create")
    ) {
      res.status(400).json({
        error:
          "Body inválido. Se requieren mode, guildId, channelId y messageSource (existing|create).",
        code: "INVALID_BODY",
      } satisfies ApiErrorBody);
      return;
    }

    try {
      const payload: CreateAutoRoleRequest = {
        mode: body.mode,
        guildId: body.guildId,
        channelId: body.channelId,
        messageSource: body.messageSource,
        messageId:
          typeof body.messageId === "string" ? body.messageId : undefined,
        embed:
          body.embed && typeof body.embed === "object" ? body.embed : undefined,
        reactionMappings: Array.isArray(body.reactionMappings)
          ? body.reactionMappings
          : undefined,
        buttonMappings: Array.isArray(body.buttonMappings)
          ? body.buttonMappings
          : undefined,
      };

      const result = await createAutoRoleSetup(bot, payload);
      res.status(201).json(result);
    } catch (error: unknown) {
      if (error instanceof AutoRoleError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
        } satisfies ApiErrorBody);
        return;
      }

      console.error("[adobos] Error en POST /api/roles/interactive:", error);
      res.status(500).json({
        error: "No se pudo publicar el menú interactivo.",
        code: "INTERNAL_ERROR",
      } satisfies ApiErrorBody);
    }
  });

  return router;
}
