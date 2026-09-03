import { isStreamAlertDestinationChannelType } from "@adobos/shared";
import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "../../../core/http/channelScope.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { recordId } from "../../../core/http/schemas.js";
import { parse } from "../../../core/http/validate.js";
import {
  createStreamAlert,
  deleteStreamAlert,
  listStreamAlertsConfig,
  StreamAlertsError,
  updateStreamAlert,
} from "../service.js";
import { createStreamAlertSchema, updateStreamAlertSchema } from "./schema.js";

async function assertDestinationChannel(
  bot: Client,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await fetchChannelInGuild(bot, channelId, guildId);
  if (!isStreamAlertDestinationChannelType(channel.type)) {
    const kind =
      channel.type === ChannelType.GuildForum ? "a forum" : "this channel type";
    throw new StreamAlertsError(
      `Use a text or announcement channel (not ${kind}).`,
      400,
      "INVALID_CHANNEL_TYPE",
    );
  }
}

export function streamAlertsRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await listStreamAlertsConfig(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(createStreamAlertSchema, req.body ?? {});
      await assertDestinationChannel(bot, body.discordChannelId, guildId);
      const alert = await createStreamAlert(body, guildId);
      res.status(201).json({ alert });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const id = parse(recordId, req.params.id);
      const body = parse(updateStreamAlertSchema, req.body ?? {});
      if (typeof body.discordChannelId === "string" && body.discordChannelId) {
        await assertDestinationChannel(bot, body.discordChannelId, guildId);
      }
      const alert = await updateStreamAlert(id, body, guildId);
      res.json({ alert });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      await deleteStreamAlert(id, guildIdOf(req));
      res.status(204).send();
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
