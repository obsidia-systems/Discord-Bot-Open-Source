import type {
  EconomyLeaderboardEntry,
  EconomyLeaderboardResponse,
} from "@adobos/shared";
import { Router } from "express";
import { z } from "zod";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { leaderboardQuerySchema, stringId } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  getEconomyCasinoConfig,
  updateEconomyCasinoConfig,
} from "../domain/casinoService.js";
import {
  getEconomyConfig,
  getEconomyLeaderboardTotal,
  listEconomyLeaderboardRows,
  updateEconomyConfig,
} from "../domain/economy.js";
import { adjustEconomyFunds } from "../domain/funds.js";
import {
  getEconomyIncomeConfig,
  updateEconomyIncomeConfig,
} from "../domain/incomeService.js";
import {
  createShopItem,
  deleteShopItem,
  listShopItems,
  updateShopItem,
} from "../domain/shopService.js";
import {
  adjustEconomyFundsSchema,
  createShopItemSchema,
  updateEconomyCasinoSchema,
  updateEconomyConfigSchema,
  updateEconomyIncomeSchema,
  updateShopItemSchema,
} from "./schema.js";

const shopIdParams = z.object({ id: stringId });

async function resolveLeaderboard(
  gateway: BotGateway,
  guildId: string,
  limit: number,
): Promise<EconomyLeaderboardResponse> {
  const rows = await listEconomyLeaderboardRows(guildId, limit);
  const total = await getEconomyLeaderboardTotal(guildId);

  const resolved = await gateway.resolveMembers(
    guildId,
    rows.map((row) => row.userId),
  );

  const entries: EconomyLeaderboardEntry[] = rows.map((row) => {
    const member = resolved.get(row.userId);
    return {
      rank: row.rank,
      userId: row.userId,
      username: member?.username ?? row.userId,
      displayName: member?.displayName ?? "Unknown User",
      avatarUrl: member?.avatarUrl ?? null,
      wallet: row.wallet,
      bank: row.bank,
      total: row.total,
    };
  });

  return { entries, total };
}

export function economyRoutes(gateway: BotGateway): Router {
  const router = Router();

  /** GET /api/economy/config */
  router.get(
    "/config",
    defineRoute({}, async (req, res) => {
      const config = await getEconomyConfig(guildIdOf(req));
      res.json({ config });
    }),
  );

  /** PUT /api/economy/config */
  router.put(
    "/config",
    defineRoute(
      { body: updateEconomyConfigSchema },
      async (req, res, valid) => {
        const config = await updateEconomyConfig({
          ...valid.body,
          guildId: guildIdOf(req),
        });
        res.json({ config });
      },
    ),
  );

  /** GET /api/economy/income */
  router.get(
    "/income",
    defineRoute({}, async (req, res) => {
      const config = await getEconomyIncomeConfig(guildIdOf(req));
      res.json({ config });
    }),
  );

  /** PUT /api/economy/income */
  router.put(
    "/income",
    defineRoute(
      { body: updateEconomyIncomeSchema },
      async (req, res, valid) => {
        const config = await updateEconomyIncomeConfig({
          ...valid.body,
          guildId: guildIdOf(req),
        });
        res.json({ config });
      },
    ),
  );

  /** GET /api/economy/casino */
  router.get(
    "/casino",
    defineRoute({}, async (req, res) => {
      const config = await getEconomyCasinoConfig(guildIdOf(req));
      res.json({ config });
    }),
  );

  /** PUT /api/economy/casino */
  router.put(
    "/casino",
    defineRoute(
      { body: updateEconomyCasinoSchema },
      async (req, res, valid) => {
        const config = await updateEconomyCasinoConfig({
          ...valid.body,
          guildId: guildIdOf(req),
        });
        res.json({ config });
      },
    ),
  );

  /** GET /api/economy/shop/items */
  router.get(
    "/shop/items",
    defineRoute({}, async (req, res) => {
      const items = await listShopItems(guildIdOf(req));
      res.json({ items });
    }),
  );

  /** POST /api/economy/shop/items */
  router.post(
    "/shop/items",
    defineRoute({ body: createShopItemSchema }, async (req, res, valid) => {
      const item = await createShopItem({
        ...valid.body,
        guildId: guildIdOf(req),
      });
      res.status(201).json({ item });
    }),
  );

  /** PUT /api/economy/shop/items/:id */
  router.put(
    "/shop/items/:id",
    defineRoute(
      { params: shopIdParams, body: updateShopItemSchema },
      async (req, res, valid) => {
        const item = await updateShopItem(valid.params.id, {
          ...valid.body,
          guildId: guildIdOf(req),
        });
        res.json({ item });
      },
    ),
  );

  /** DELETE /api/economy/shop/items/:id */
  router.delete(
    "/shop/items/:id",
    defineRoute({ params: shopIdParams }, async (req, res, valid) => {
      await deleteShopItem(valid.params.id, guildIdOf(req));
      res.json({ ok: true });
    }),
  );

  /** GET /api/economy/leaderboard?limit=100 */
  router.get(
    "/leaderboard",
    defineRoute({ query: leaderboardQuerySchema }, async (req, res, valid) => {
      const limit = valid.query.limit ?? 100;
      const payload = await resolveLeaderboard(gateway, guildIdOf(req), limit);
      res.json(payload);
    }),
  );

  /** POST /api/economy/funds — override admin de saldos */
  router.post(
    "/funds",
    defineRoute({ body: adjustEconomyFundsSchema }, async (req, res, valid) => {
      const result = await adjustEconomyFunds({
        ...valid.body,
        guildId: guildIdOf(req),
      });
      res.json(result);
    }),
  );

  return router;
}
