import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  LevelsLeaderboardEntry,
  LevelsLeaderboardResponse,
} from "@adobos/shared";
import { resolveMembersBatch } from "../../../lib/discordMember.js";
import { forceLiveLeaderboardRefresh } from "../liveLeaderboard.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse, parseQuery, sendIfValidationError } from "../../../core/http/validate.js";
import {
  leaderboardQuerySchema,
  updateLevelsConfigSchema,
} from "../../../core/http/schemas.js";
import {
  LevelsError,
  getLeaderboardTotal,
  getLevelsConfig,
  listLeaderboardRows,
  updateLevelsConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (sendIfValidationError(error, res)) return;
  if (error instanceof LevelsError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/levels:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Rangos y XP.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

async function resolveLeaderboardEntries(
  bot: Client,
  guildId: string,
  limit: number,
): Promise<LevelsLeaderboardResponse> {
  const rows = await listLeaderboardRows(guildId, limit);
  const total = await getLeaderboardTotal(guildId);
  const guild =
    bot.guilds.cache.get(guildId) ??
    (await bot.guilds.fetch(guildId).catch(() => null));

  const resolved = await resolveMembersBatch(
    guild,
    bot,
    rows.map((row) => row.userId),
  );

  const entries: LevelsLeaderboardEntry[] = rows.map((row) => {
    const member = resolved.get(row.userId);
    return {
      rank: row.rank,
      userId: row.userId,
      username: member?.username ?? row.userId,
      displayName: member?.displayName ?? "Usuario Desconocido",
      avatarUrl: member?.avatarUrl ?? null,
      level: row.level,
      xp: row.xp,
    };
  });

  return { entries, total };
}

export function levelsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/levels/config */
  router.get("/config", async (req, res) => {
    try {
      const guildId =
        guildIdOf(req);
      const config = await getLevelsConfig(guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/levels/config */
  router.post("/config", async (req, res) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateLevelsConfigSchema, req.body);
      const before = await getLevelsConfig(guildId);
      const config = await updateLevelsConfig(body, guildId);

      if (
        body.liveLeaderboardChannelId !== undefined &&
        body.liveLeaderboardChannelId !== before.liveLeaderboardChannelId &&
        config.liveLeaderboardChannelId
      ) {
        await forceLiveLeaderboardRefresh(bot, config.guildId);
      }

      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/levels/leaderboard?limit=100 */
  router.get("/leaderboard", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
        const { limit: limitRaw } = parseQuery(leaderboardQuerySchema, req.query);
        const limit = limitRaw ?? 100;
        const payload = await resolveLeaderboardEntries(bot, guildId, limit);
        res.json(payload);
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
