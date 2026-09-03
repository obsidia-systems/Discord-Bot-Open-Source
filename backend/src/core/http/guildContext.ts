import type { NextFunction, Request, RequestHandler, Response } from "express";
import { userManagesGuild } from "../auth/discordGuilds.js";
import { readSessionFromRequest, redirectToLogin } from "../auth/oauth.js";
import type { GuildContext } from "../auth/types.js";
import { DiscordHttpError } from "../discord/discordHttpError.js";
import { entitlementsOf, getGuildTier } from "../entitlements/service.js";
import { logger } from "../log.js";
import { HttpError } from "./httpError.js";
import { isSnowflake } from "./snowflake.js";

export function extractGuildId(req: Request): unknown {
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
        next(
          new HttpError("Invalid or missing guildId.", 400, "INVALID_GUILD_ID"),
        );
        return;
      }

      const allowed = await userManagesGuild(session, raw);
      if (!allowed) {
        next(
          new HttpError(
            "You don't have permission to manage this server.",
            403,
            "GUILD_FORBIDDEN",
          ),
        );
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
      if (
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body)
      ) {
        (req.body as Record<string, unknown>).guildId = raw;
      }
      next();
    } catch (error: unknown) {
      if (error instanceof DiscordHttpError && error.status === 429) {
        next(
          new HttpError(
            "Discord is rate limiting requests. Try again in a moment.",
            429,
            "DISCORD_RATE_LIMITED",
          ),
        );
        return;
      }
      if (error instanceof DiscordHttpError && error.status === 401) {
        next(new HttpError("Session expired.", 401, "UNAUTHENTICATED"));
        return;
      }
      logger.error({ err: error }, "requireGuildAccess failed");
      next(
        new HttpError(
          "Couldn't verify access to the server.",
          502,
          "GUILD_ACCESS_CHECK_FAILED",
        ),
      );
    }
  };
}

/** guildId ya autorizado. Lanza si el middleware no se aplicó. */
export function guildIdOf(req: Request): string {
  const id = req.guild?.guildId;
  if (!id) {
    throw new HttpError(
      "requireGuildAccess was not applied on this route.",
      500,
      "MISSING_GUILD_CONTEXT",
    );
  }
  return id;
}
