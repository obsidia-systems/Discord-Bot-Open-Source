import type { Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
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

  router.get(
    "/settings",
    defineRoute({}, async (req, res) => {
      res.json({ settings: await getGiveawaySettings(guildIdOf(req)) });
    }),
  );

  router.put(
    "/settings",
    defineRoute(
      { body: updateGiveawaySettingsSchema },
      async (req, res, valid) => {
        const settings = await updateGiveawaySettings(
          valid.body,
          guildIdOf(req),
        );
        res.json({ settings });
      },
    ),
  );

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json({ giveaways: await listGiveaways(guildIdOf(req)) });
    }),
  );

  router.post(
    "/",
    defineRoute({ body: createGiveawaySchema }, async (req, res, valid) => {
      const giveaway = await createAndPublishGiveaway({
        bot,
        guildId: guildIdOf(req),
        createdBy: actorIdOf(req),
        body: valid.body,
      });
      res.status(201).json({ giveaway });
    }),
  );

  router.get(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      res.json({
        giveaway: await getGiveawayDetail(valid.params.id, guildIdOf(req)),
      });
    }),
  );

  router.post(
    "/:id/end",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const giveaway = await endGiveawayNow({
        bot,
        giveawayId: valid.params.id,
        guildId: guildIdOf(req),
      });
      res.json({ giveaway });
    }),
  );

  router.post(
    "/:id/cancel",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const giveaway = await cancelGiveawayNow({
        bot,
        giveawayId: valid.params.id,
        guildId: guildIdOf(req),
      });
      res.json({ giveaway });
    }),
  );

  router.post(
    "/:id/reroll",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const giveaway = await rerollGiveawayNow({
        bot,
        giveawayId: valid.params.id,
        guildId: guildIdOf(req),
      });
      res.json({ giveaway });
    }),
  );

  router.post(
    "/:id/publish",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const giveaway = await republishGiveaway(
        bot,
        valid.params.id,
        guildIdOf(req),
      );
      res.json({ giveaway });
    }),
  );

  return router;
}
