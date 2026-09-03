import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  cancelGiveawayNow,
  createAndPublishGiveaway,
  endGiveawayNow,
  republishGiveaway,
  rerollGiveawayNow,
} from "../actions.js";
import {
  GiveawaysError,
  getGiveawayDetail,
  getGiveawaySettings,
  listGiveaways,
  updateGiveawaySettings,
} from "../service.js";
import {
  createGiveawaySchema,
  updateGiveawaySettingsSchema,
} from "./schema.js";

function actorIdOf(req: Parameters<typeof guildIdOf>[0]): string {
  const id = req.guild?.userId;
  if (!id) {
    throw new GiveawaysError("Missing panel user.", 401, "UNAUTHENTICATED");
  }
  return id;
}

export function giveawaysRoutes(bot: Client): Router {
  const router = Router();

  router.get("/settings", async (req, res, next) => {
    try {
      res.json({ settings: await getGiveawaySettings(guildIdOf(req)) });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.put("/settings", async (req, res, next) => {
    try {
      const settings = await updateGiveawaySettings(
        parse(updateGiveawaySettingsSchema, req.body ?? {}),
        guildIdOf(req),
      );
      res.json({ settings });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      res.json({ giveaways: await listGiveaways(guildIdOf(req)) });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const giveaway = await createAndPublishGiveaway({
        bot,
        guildId: guildIdOf(req),
        createdBy: actorIdOf(req),
        body: parse(createGiveawaySchema, req.body ?? {}),
      });
      res.status(201).json({ giveaway });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      res.json({
        giveaway: await getGiveawayDetail(
          parse(recordId, req.params.id),
          guildIdOf(req),
        ),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/end", async (req, res, next) => {
    try {
      const giveaway = await endGiveawayNow({
        bot,
        giveawayId: parse(recordId, req.params.id),
        guildId: guildIdOf(req),
      });
      res.json({ giveaway });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/cancel", async (req, res, next) => {
    try {
      const giveaway = await cancelGiveawayNow({
        bot,
        giveawayId: parse(recordId, req.params.id),
        guildId: guildIdOf(req),
      });
      res.json({ giveaway });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/reroll", async (req, res, next) => {
    try {
      const giveaway = await rerollGiveawayNow({
        bot,
        giveawayId: parse(recordId, req.params.id),
        guildId: guildIdOf(req),
      });
      res.json({ giveaway });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/publish", async (req, res, next) => {
    try {
      const giveaway = await republishGiveaway(
        bot,
        parse(recordId, req.params.id),
        guildIdOf(req),
      );
      res.json({ giveaway });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
