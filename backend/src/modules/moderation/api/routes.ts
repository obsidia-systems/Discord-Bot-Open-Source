import { Router } from "express";
import type { Client } from "discord.js";
import type { ApiErrorBody, ModActionRequest } from "@adobos/shared";
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

function handleError(
  error: unknown,
  res: import("express").Response,
  label: string,
): void {
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
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const guildId =
      guildIdOf(req);
    try {
      res.json(await searchMembers(bot, q, guildId));
    } catch (error: unknown) {
      handleError(error, res, "search-member");
    }
  });

  router.get("/search-channel", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const guildId =
      guildIdOf(req);
    try {
      res.json(await searchChannels(bot, q, guildId));
    } catch (error: unknown) {
      handleError(error, res, "search-channel");
    }
  });

  router.get("/member-info/:id", async (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await getMemberInfo(bot, req.params.id ?? "", guildId));
    } catch (error: unknown) {
      handleError(error, res, "member-info");
    }
  });

  router.get("/channel-info/:id", async (req, res) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await getChannelInfo(bot, req.params.id ?? "", guildId));
    } catch (error: unknown) {
      handleError(error, res, "channel-info");
    }
  });

  router.get("/fetch-message", async (req, res) => {
    const channelId =
      typeof req.query.channelId === "string" ? req.query.channelId : "";
    const messageId =
      typeof req.query.messageId === "string" ? req.query.messageId : "";
    const guildId =
      guildIdOf(req);
    try {
      res.json(await fetchDiscordMessage(bot, channelId, messageId, guildId));
    } catch (error: unknown) {
      handleError(error, res, "fetch-message");
    }
  });

  router.post("/action", async (req, res) => {
    try {
      const payload = req.body as ModActionRequest;
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
    const guildId =
      guildIdOf(req);
    const userId =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const limitRaw =
      typeof req.query.limit === "string"
        ? Number.parseInt(req.query.limit, 10)
        : 100;
    const actionTypeRaw =
      typeof req.query.actionType === "string"
        ? Number.parseInt(req.query.actionType, 10)
        : undefined;
    try {
      res.json(
        await fetchDiscordAuditLog(bot, {
          guildId,
          limit: limitRaw,
          userId,
          actionType: Number.isFinite(actionTypeRaw)
            ? actionTypeRaw
            : undefined,
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
