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
  UpdateEconomyCasinoRequest,
  UpdateEconomyShopItemRequest,
} from "@adobos/shared";
import { resolveMembersBatch } from "../../../lib/discordMember.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import {
  getEconomyCasinoConfig,
  updateEconomyCasinoConfig,
} from "../casinoService.js";
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

async function resolveLeaderboard(
  bot: Client,
  guildId: string,
  limit: number,
): Promise<EconomyLeaderboardResponse> {
  const rows = await listEconomyLeaderboardRows(guildId, limit);
  const total = await getEconomyLeaderboardTotal(guildId);
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
  router.get("/config", async (req, res) => {
    try {
      const config = await getEconomyConfig(guildIdOf(req));
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/config */
  router.put("/config", async (req, res) => {
    try {
      const body = req.body as UpdateEconomyConfigRequest;
      const config = await updateEconomyConfig({
        ...body,
        guildId: guildIdOf(req) ?? body.guildId,
      });
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/income */
  router.get("/income", async (req, res) => {
    try {
      const config = await getEconomyIncomeConfig(guildIdOf(req));
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/income */
  router.put("/income", async (req, res) => {
    try {
      const body = req.body as UpdateEconomyIncomeRequest;
      const config = await updateEconomyIncomeConfig({
        ...body,
        guildId: guildIdOf(req) ?? body.guildId,
      });
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/casino */
  router.get("/casino", async (req, res) => {
    try {
      const config = await getEconomyCasinoConfig(guildIdOf(req));
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/casino */
  router.put("/casino", async (req, res) => {
    try {
      const body = req.body as UpdateEconomyCasinoRequest;
      const config = await updateEconomyCasinoConfig({
        ...body,
        guildId: guildIdOf(req) ?? body.guildId,
      });
      res.json({ config });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/shop/items */
  router.get("/shop/items", async (req, res) => {
    try {
      const items = await listShopItems(guildIdOf(req));
      res.json({ items });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** POST /api/economy/shop/items */
  router.post("/shop/items", async (req, res) => {
    try {
      const body = req.body as CreateEconomyShopItemRequest;
      const item = await createShopItem({
        ...body,
        guildId: guildIdOf(req) ?? body.guildId,
      });
      res.status(201).json({ item });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** PUT /api/economy/shop/items/:id */
  router.put("/shop/items/:id", async (req, res) => {
    try {
      const body = req.body as UpdateEconomyShopItemRequest;
      const item = await updateShopItem(req.params.id, {
        ...body,
        guildId: guildIdOf(req) ?? body.guildId,
      });
      res.json({ item });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** DELETE /api/economy/shop/items/:id */
  router.delete("/shop/items/:id", async (req, res) => {
    try {
      await deleteShopItem(req.params.id, guildIdOf(req));
      res.json({ ok: true });
    } catch (error) {
      handleError(error, res);
    }
  });

  /** GET /api/economy/leaderboard?limit=100 */
  router.get("/leaderboard", async (req, res) => {
    void (async () => {
      try {
        const guildId = guildIdOf(req);
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
  router.post("/funds", async (req, res) => {
    try {
      const body = req.body as AdjustEconomyFundsRequest;
      const result = await adjustEconomyFunds({
        ...body,
        guildId: guildIdOf(req),
      });
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
