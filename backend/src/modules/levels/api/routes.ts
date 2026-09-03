import type {
  LevelsLeaderboardEntry,
  LevelsLeaderboardResponse,
} from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { leaderboardQuerySchema } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import { resolveMembersBatch } from "#lib/discordMember.js";
import { forceLiveLeaderboardRefresh } from "../liveLeaderboard.js";
import {
  getLeaderboardTotal,
  getLevelsConfig,
  listLeaderboardRows,
  updateLevelsConfig,
} from "../service.js";
import { updateLevelsConfigSchema } from "./schema.js";

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
      displayName: member?.displayName ?? "Unknown User",
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
  router.get(
    "/config",
    defineRoute({}, async (req, res) => {
      const config = await getLevelsConfig(guildIdOf(req));
      res.json({ config });
    }),
  );

  /** POST /api/levels/config */
  router.post(
    "/config",
    defineRoute({ body: updateLevelsConfigSchema }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      const before = await getLevelsConfig(guildId);
      const config = await updateLevelsConfig(valid.body, guildId);

      if (
        valid.body.liveLeaderboardChannelId !== undefined &&
        valid.body.liveLeaderboardChannelId !==
          before.liveLeaderboardChannelId &&
        config.liveLeaderboardChannelId
      ) {
        await forceLiveLeaderboardRefresh(bot, config.guildId);
      }

      res.json({ config });
    }),
  );

  /** GET /api/levels/leaderboard?limit=100 */
  router.get(
    "/leaderboard",
    defineRoute({ query: leaderboardQuerySchema }, async (req, res, valid) => {
      const limit = valid.query.limit ?? 100;
      const payload = await resolveLeaderboardEntries(
        bot,
        guildIdOf(req),
        limit,
      );
      res.json(payload);
    }),
  );

  return router;
}
