import { Router } from "express";
import type { Client } from "discord.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, sendIfValidationError } from "../../../core/http/validate.js";
import { saveWelcomeSettingsSchema } from "../../../core/http/schemas.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  WelcomeSettingsError,
  getWelcomeSettings,
  saveWelcomeSettings,
} from "../service.js";

export function welcomeSettingsRoutes(_bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const guildId =
      guildIdOf(req);

    try {
      res.json(await getWelcomeSettings(guildId));
    } catch (error: unknown) {
      if (error instanceof WelcomeSettingsError) {
        const body: ApiErrorBody = {
          error: error.message,
          code: error.code,
        };
        res.status(error.status).json(body);
        return;
      }

      console.error("[adobos] Error en GET /api/welcome-settings:", error);
      const body: ApiErrorBody = {
        error: "No se pudo cargar la configuración de bienvenida.",
        code: "INTERNAL_ERROR",
      };
      res.status(500).json(body);
    }
  });

  router.post("/", async (req, res) => {
    try {
      const payload = parse(saveWelcomeSettingsSchema, req.body);
      const result = await saveWelcomeSettings({
        ...payload,
        guildId: guildIdOf(req),
      });
      res.json(result);
    } catch (error: unknown) {
      if (sendIfValidationError(error, res)) return;
      if (error instanceof WelcomeSettingsError) {
        const body: ApiErrorBody = {
          error: error.message,
          code: error.code,
        };
        res.status(error.status).json(body);
        return;
      }

      console.error("[adobos] Error en POST /api/welcome-settings:", error);
      const body: ApiErrorBody = {
        error: "No se pudo guardar la configuración de bienvenida.",
        code: "INTERNAL_ERROR",
      };
      res.status(500).json(body);
    }
  });

  return router;
}
