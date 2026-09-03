import type { Client } from "discord.js";
import { Router } from "express";
import { z } from "zod";
import { guildIdOf } from "#core/http/guildContext.js";
import { searchQuerySchema, snowflake } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import { fetchDiscordAuditLog } from "../audit.js";
import {
  executeModAction,
  fetchDiscordMessage,
  getChannelInfo,
  getMemberInfo,
  listActiveBans,
  listActiveTimeouts,
  searchChannels,
  searchMembers,
} from "../discord.js";
import {
  discordAuditQuerySchema,
  fetchMessageQuerySchema,
  modActionSchema,
} from "./schema.js";

const snowflakeIdParams = z.object({ id: snowflake });

export function moderationRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/search-member",
    defineRoute({ query: searchQuerySchema }, async (req, res, valid) => {
      res.json(await searchMembers(bot, valid.query.q ?? "", guildIdOf(req)));
    }),
  );

  router.get(
    "/search-channel",
    defineRoute({ query: searchQuerySchema }, async (req, res, valid) => {
      res.json(await searchChannels(bot, valid.query.q ?? "", guildIdOf(req)));
    }),
  );

  router.get(
    "/member-info/:id",
    defineRoute({ params: snowflakeIdParams }, async (req, res, valid) => {
      res.json(await getMemberInfo(bot, valid.params.id, guildIdOf(req)));
    }),
  );

  router.get(
    "/channel-info/:id",
    defineRoute({ params: snowflakeIdParams }, async (req, res, valid) => {
      res.json(await getChannelInfo(bot, valid.params.id, guildIdOf(req)));
    }),
  );

  router.get(
    "/fetch-message",
    defineRoute({ query: fetchMessageQuerySchema }, async (req, res, valid) => {
      res.json(
        await fetchDiscordMessage(
          bot,
          valid.query.channelId,
          valid.query.messageId,
          guildIdOf(req),
        ),
      );
    }),
  );

  router.post(
    "/action",
    defineRoute({ body: modActionSchema }, async (req, res, valid) => {
      const result = await executeModAction(
        bot,
        { ...valid.body, guildId: guildIdOf(req) },
        req.guild?.userId,
      );
      res.status(result.dmFailed ? 206 : 200).json(result);
    }),
  );

  router.get(
    "/discord-audit",
    defineRoute({ query: discordAuditQuerySchema }, async (req, res, valid) => {
      res.json(
        await fetchDiscordAuditLog(bot, {
          guildId: guildIdOf(req),
          limit: valid.query.limit ?? 100,
          userId: valid.query.userId,
          actionType: valid.query.actionType,
        }),
      );
    }),
  );

  router.get(
    "/active/bans",
    defineRoute({}, async (req, res) => {
      res.json(await listActiveBans(bot, guildIdOf(req)));
    }),
  );

  router.get(
    "/active/timeouts",
    defineRoute({}, async (req, res) => {
      res.json(await listActiveTimeouts(bot, guildIdOf(req)));
    }),
  );

  return router;
}
