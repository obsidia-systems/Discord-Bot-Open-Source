import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  LevelsLeaderboardEntry,
  LevelsLeaderboardResponse,
  UpdateLevelsConfigRequest,
} from "@adobos/shared";
import { forceLiveLeaderboardRefresh } from "../liveLeaderboard.js";
import {
  LevelsError,
  getLeaderboardTotal,
  getLevelsConfig,
  listLeaderboardRows,
  updateLevelsConfig,
} from "../service.js";

function handleError(error: unknown, res: import("express").Response): void {
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
  const rows = listLeaderboardRows(guildId, limit);
  const total = getLeaderboardTotal(guildId);
  const guild = await bot.guilds.fetch(guildId).catch(() => null);

  const entries: LevelsLeaderboardEntry[] = [];
  for (const row of rows) {
    const member = await guild?.members.fetch(row.userId).catch(() => null);
    const user =
      member?.user ??
      (await bot.users.fetch(row.userId).catch(() => null));
    entries.push({
      rank: row.rank,
      userId: row.userId,
      username: user?.username ?? row.userId,
      displayName: member?.displayName ?? user?.username ?? row.userId,
      avatarUrl: user?.displayAvatarURL({ size: 64 }) ?? null,
      level: row.level,
      xp: row.xp,
    });
  }

  return { entries, total };
}

export function levelsRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/levels/config */
  router.get("/config", (req, res) => {
    try {
      const guildId =
        typeof req.query.guildId === "string" ? req.query.guildId : undefined;
      const config = getLevelsConfig(guildId);
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/levels/config */
  router.post("/config", (req, res) => {
    try {
      const guildId =
        typeof req.body?.guildId === "string"
          ? req.body.guildId
          : typeof req.query.guildId === "string"
            ? req.query.guildId
            : undefined;
      const body = (req.body ?? {}) as UpdateLevelsConfigRequest;
      const before = getLevelsConfig(guildId);
      const config = updateLevelsConfig(body, guildId);

      if (
        body.liveLeaderboardChannelId !== undefined &&
        body.liveLeaderboardChannelId !== before.liveLeaderboardChannelId &&
        config.liveLeaderboardChannelId
      ) {
        forceLiveLeaderboardRefresh(bot, config.guildId);
      }

      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/levels/leaderboard?limit=100 */
  router.get("/leaderboard", (req, res) => {
    void (async () => {
      try {
        const guildId =
          typeof req.query.guildId === "string"
            ? req.query.guildId
            : process.env.DISCORD_GUILD_ID;
        if (!guildId) {
          throw new LevelsError(
            "Falta DISCORD_GUILD_ID (o guildId).",
            400,
            "MISSING_GUILD_ID",
          );
        }
        const limitRaw = Number(req.query.limit ?? 100);
        const limit = Number.isFinite(limitRaw)
          ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
          : 100;
        const payload = await resolveLeaderboardEntries(bot, guildId, limit);
        res.json(payload);
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  return router;
}
