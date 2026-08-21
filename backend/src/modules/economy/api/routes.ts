import { Router } from "express";
import type { Client } from "discord.js";
import type {
  AdjustEconomyFundsRequest,
  ApiErrorBody,
  CreateEconomyShopItemRequest,
  EconomyLeaderboardEntry,
  EconomyLeaderboardResponse,
  UpdateEconomyConfigRequest,
  UpdateEconomyIncomeRequest,
  UpdateEconomyShopItemRequest,
} from "@adobos/shared";
import { resolveMembersBatch } from "../../../lib/discordMember.js";
import {
  getEconomyIncomeConfig,
  updateEconomyIncomeConfig,
} from "../incomeService.js";
import {
  EconomyError,
  adjustEconomyFunds,
  getEconomyConfig,
  getEconomyLeaderboardTotal,
  listEconomyLeaderboardRows,
  updateEconomyConfig,
} from "../service.js";
import {
  createShopItem,
  deleteShopItem,
  listShopItems,
  updateShopItem,
} from "../shopService.js";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof EconomyError) {
    const body: ApiErrorBody = {
      error: error.message,
      code: error.code,
    };
    res.status(error.status).json(body);
    return;
  }
  console.error("[adobos] Error en /api/economy:", error);
  const body: ApiErrorBody = {
    error: "Error interno en Economía.",
    code: "INTERNAL_ERROR",
  };
  res.status(500).json(body);
}

function resolveGuildId(req: {
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string | undefined {
  if (typeof req.body?.guildId === "string") return req.body.guildId;
  if (typeof req.query.guildId === "string") return req.query.guildId;
  return undefined;
}

async function resolveLeaderboard(
  bot: Client,
  guildId: string,
  limit: number,
): Promise<EconomyLeaderboardResponse> {
  const rows = listEconomyLeaderboardRows(guildId, limit);
  const total = getEconomyLeaderboardTotal(guildId);
  const guild =
    bot.guilds.cache.get(guildId) ??
    (await bot.guilds.fetch(guildId).catch(() => null));

  const resolved = await resolveMembersBatch(
    guild,
    bot,
    rows.map((row) => row.userId),
  );

  const entries: EconomyLeaderboardEntry[] = rows.map((row) => {
    const member = resolved.get(row.userId);
    return {
      rank: row.rank,
      userId: row.userId,
      username: member?.username ?? row.userId,
      displayName: member?.displayName ?? "Usuario Desconocido",
      avatarUrl: member?.avatarUrl ?? null,
      wallet: row.wallet,
      bank: row.bank,
      total: row.total,
    };
  });

  return { entries, total };
}

export function economyRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/economy/config */
  router.get("/config", (req, res) => {
    try {
      const config = getEconomyConfig(resolveGuildId(req));
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/config */
  router.put("/config", (req, res) => {
    try {
      const body = req.body as UpdateEconomyConfigRequest;
      const config = updateEconomyConfig({
        ...body,
        guildId: resolveGuildId(req) ?? body.guildId,
      });
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/income */
  router.get("/income", (req, res) => {
    try {
      const config = getEconomyIncomeConfig(resolveGuildId(req));
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/income */
  router.put("/income", (req, res) => {
    try {
      const body = req.body as UpdateEconomyIncomeRequest;
      const config = updateEconomyIncomeConfig({
        ...body,
        guildId: resolveGuildId(req) ?? body.guildId,
      });
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/shop/items */
  router.get("/shop/items", (req, res) => {
    try {
      const items = listShopItems(resolveGuildId(req));
      res.json({ items });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/economy/shop/items */
  router.post("/shop/items", (req, res) => {
    try {
      const body = req.body as CreateEconomyShopItemRequest;
      const item = createShopItem({
        ...body,
        guildId: resolveGuildId(req) ?? body.guildId,
      });
      res.status(201).json({ item });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/shop/items/:id */
  router.put("/shop/items/:id", (req, res) => {
    try {
      const body = req.body as UpdateEconomyShopItemRequest;
      const item = updateShopItem(req.params.id, {
        ...body,
        guildId: resolveGuildId(req) ?? body.guildId,
      });
      res.json({ item });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** DELETE /api/economy/shop/items/:id */
  router.delete("/shop/items/:id", (req, res) => {
    try {
      deleteShopItem(req.params.id, resolveGuildId(req));
      res.json({ ok: true });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/leaderboard?limit=100 */
  router.get("/leaderboard", (req, res) => {
    void (async () => {
      try {
        const guildId = resolveGuildId(req) ?? process.env.DISCORD_GUILD_ID;
        if (!guildId) {
          throw new EconomyError(
            "Falta DISCORD_GUILD_ID (o guildId).",
            400,
            "MISSING_GUILD_ID",
          );
        }
        const rawLimit = Number(req.query.limit ?? 100);
        const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
        const payload = await resolveLeaderboard(bot, guildId, limit);
        res.json(payload);
      } catch (error) {
        handleError(error, res);
      }
    })();
  });

  /** POST /api/economy/funds — override admin de saldos */
  router.post("/funds", (req, res) => {
    try {
      const body = req.body as AdjustEconomyFundsRequest;
      const result = adjustEconomyFunds({
        ...body,
        guildId: resolveGuildId(req) ?? body.guildId,
      });
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
