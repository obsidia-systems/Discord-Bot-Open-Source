import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody } from "@adobos/shared";
import {
  ModerationError,
  executeModAction,
  fetchDiscordMessage,
  getChannelInfo,
  getMemberInfo,
  listActiveBans,
  listActiveTimeouts,
  searchChannels,
  searchMembers,
} from "../service.js";
import { fetchDiscordAuditLog } from "../audit.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, parseQuery, sendIfValidationError } from "../../../core/http/validate.js";
import {
  discordAuditQuerySchema,
  fetchMessageQuerySchema,
  modActionSchema,
  searchQuerySchema,
  snowflake,
} from "../../../core/http/schemas.js";

function handleError(
  error: unknown,
  res: import("express").Response,
  label: string,
): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof ModerationError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }

  console.error(`[adobos] Error en /api/mod/${label}:`, error);
  const body: ApiErrorBody = {
    error: "Error interno de moderación.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

export function moderationRoutes(bot: Client): Router {
  const router = Router();

  router.get("/search-member", async (req, res) => {
    try {
      const { q = "" } = parseQuery(searchQuerySchema, req.query);
      res.json(await searchMembers(bot, q, guildIdOf(req)));
    } catch (error: unknown) {
      handleError(error, res, "search-member");
    }
  });

  router.get("/search-channel", async (req, res) => {
    try {
      const { q = "" } = parseQuery(searchQuerySchema, req.query);
      res.json(await searchChannels(bot, q, guildIdOf(req)));
    } catch (error: unknown) {
      handleError(error, res, "search-channel");
    }
  });

  router.get("/member-info/:id", async (req, res) => {
    try {
      const id = parse(snowflake, req.params.id);
      res.json(await getMemberInfo(bot, id, guildIdOf(req)));
    } catch (error: unknown) {
      handleError(error, res, "member-info");
    }
  });

  router.get("/channel-info/:id", async (req, res) => {
    try {
      const id = parse(snowflake, req.params.id);
      res.json(await getChannelInfo(bot, id, guildIdOf(req)));
    } catch (error: unknown) {
      handleError(error, res, "channel-info");
    }
  });

  router.get("/fetch-message", async (req, res) => {
    try {
      const { channelId, messageId } = parseQuery(
        fetchMessageQuerySchema,
        req.query,
      );
      res.json(
        await fetchDiscordMessage(bot, channelId, messageId, guildIdOf(req)),
      );
    } catch (error: unknown) {
      handleError(error, res, "fetch-message");
    }
  });

  router.post("/action", async (req, res) => {
    try {
      const payload = parse(modActionSchema, req.body);
      const result = await executeModAction(
        bot,
        { ...payload, guildId: guildIdOf(req) },
        req.guild?.userId,
      );
      res.status(result.dmFailed ? 206 : 200).json(result);
    } catch (error: unknown) {
      handleError(error, res, "action");
    }
  });

  router.get("/discord-audit", async (req, res) => {
    try {
      const query = parseQuery(discordAuditQuerySchema, req.query);
      res.json(
        await fetchDiscordAuditLog(bot, {
          guildId: guildIdOf(req),
          limit: query.limit ?? 100,
          userId: query.userId,
          actionType: query.actionType,
        }),
      );
    } catch (error: unknown) {
      handleError(error, res, "discord-audit");
    }
  });

  router.get("/active/bans", async (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await listActiveBans(bot, guildId));
    } catch (error: unknown) {
      handleError(error, res, "active/bans");
    }
  });

  router.get("/active/timeouts", async (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await listActiveTimeouts(bot, guildId));
    } catch (error: unknown) {
      handleError(error, res, "active/timeouts");
    }
  });

  return router;
}
