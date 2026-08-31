import type { NextFunction, Request, RequestHandler, Response } from "express";
import { decryptSecret } from "../auth/crypto.js";
import { userManagesGuild } from "../auth/discordGuilds.js";
import { readSessionFromRequest, redirectToLogin } from "../auth/oauth.js";
import type { GuildContext } from "../auth/types.js";
import { entitlementsOf, getGuildTier } from "../entitlements/service.js";
import { isSnowflake } from "./snowflake.js";

function extractGuildId(req: Request): unknown {
  if (typeof req.params.guildId === "string") return req.params.guildId;
  if (typeof req.query.guildId === "string") return req.query.guildId;
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body.guildId === "string") return body.guildId;
  return undefined;
}

/** Sesión obligatoria. 401 JSON en /api, redirect a /login en HTML. */
export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await readSessionFromRequest(req);
      if (!session) {
        redirectToLogin(req, res);
        return;
      }
      req.panelSession = session;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

/**
 * Auth + guild autorizada (MANAGE_GUILD verificado server-side, caché 60s).
 * El guildId se toma de params, query o body — nunca se cae a env.
 */
export function requireGuildAccess(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = req.panelSession ?? (await readSessionFromRequest(req));
      if (!session) {
        redirectToLogin(req, res);
        return;
      }
      req.panelSession = session;

      const raw = extractGuildId(req);
      if (!isSnowflake(raw)) {
        res.status(400).json({
          error: "guildId inválido o ausente.",
          code: "INVALID_GUILD_ID",
        });
        return;
      }

      const accessToken = decryptSecret(session.accessTokenEnc);
      const allowed = await userManagesGuild(session.userId, accessToken, raw);
      if (!allowed) {
        res.status(403).json({
          error: "No tienes permiso de gestionar este servidor.",
          code: "GUILD_FORBIDDEN",
        });
        return;
      }

      const tier = await getGuildTier(raw);
      const access = entitlementsOf(tier);
      const guild: GuildContext = {
        guildId: raw,
        userId: session.userId,
        tier,
        can: access.can,
        limit: access.limit,
      };
      req.guild = guild;
      // Canonizar: los servicios no deben leer un guildId distinto del autorizado.
      req.query.guildId = raw;
      if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
        (req.body as Record<string, unknown>).guildId = raw;
      }
      next();
    } catch (error: unknown) {
      console.error("[adobos] requireGuildAccess falló:", error);
      res.status(502).json({
        error: "No se pudo verificar el acceso al servidor.",
        code: "GUILD_ACCESS_CHECK_FAILED",
      });
    }
  };
}

/** guildId ya autorizado. Lanza si el middleware no se aplicó. */
export function guildIdOf(req: Request): string {
  const id = req.guild?.guildId;
  if (!id) {
    throw new Error("requireGuildAccess no se aplicó en esta ruta.");
  }
  return id;
}
