import { Router } from "express";
import type { Client } from "discord.js";
import {
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
import { parse, parseQuery } from "../../../core/http/validate.js";
import { searchQuerySchema, snowflake } from "../../../core/http/schemas.js";
import {
  discordAuditQuerySchema,
  fetchMessageQuerySchema,
  modActionSchema,
} from "./schema.js";

export function moderationRoutes(bot: Client): Router {
  const router = Router();

  router.get("/search-member", async (req, res, next) => {
    try {
      const { q = "" } = parseQuery(searchQuerySchema, req.query);
      res.json(await searchMembers(bot, q, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/search-channel", async (req, res, next) => {
    try {
      const { q = "" } = parseQuery(searchQuerySchema, req.query);
      res.json(await searchChannels(bot, q, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/member-info/:id", async (req, res, next) => {
    try {
      const id = parse(snowflake, req.params.id);
      res.json(await getMemberInfo(bot, id, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/channel-info/:id", async (req, res, next) => {
    try {
      const id = parse(snowflake, req.params.id);
      res.json(await getChannelInfo(bot, id, guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/fetch-message", async (req, res, next) => {
    try {
      const { channelId, messageId } = parseQuery(
        fetchMessageQuerySchema,
        req.query,
      );
      res.json(
        await fetchDiscordMessage(bot, channelId, messageId, guildIdOf(req)),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/action", async (req, res, next) => {
    try {
      const payload = parse(modActionSchema, req.body);
      const result = await executeModAction(
        bot,
        { ...payload, guildId: guildIdOf(req) },
        req.guild?.userId,
      );
      res.status(result.dmFailed ? 206 : 200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/discord-audit", async (req, res, next) => {
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
      next(error);
    }
  });

  router.get("/active/bans", async (req, res, next) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await listActiveBans(bot, guildId));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/active/timeouts", async (req, res, next) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await listActiveTimeouts(bot, guildId));
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
