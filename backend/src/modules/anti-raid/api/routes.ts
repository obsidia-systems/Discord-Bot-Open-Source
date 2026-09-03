import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "../../../core/http/channelScope.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { lockdownBodySchema, updateAntiRaidSettingsSchema } from "./schema.js";
import {
  AntiRaidError,
  getAntiRaidConfig,
  getAntiRaidSettings,
  updateAntiRaidSettings,
} from "../service.js";
import { applyGuildLockdown, liftGuildLockdown } from "../lockdown.js";
import { resolveAlertChannel, sendAntiRaidAlert } from "../alerts.js";

async function assertAlertChannel(
  bot: Client,
  channelId: string,
  guildId: string,
): Promise<void> {
  const channel = await fetchChannelInGuild(bot, channelId, guildId);
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    throw new AntiRaidError(
      "Use a text or announcement channel for the alerts.",
      400,
      "INVALID_CHANNEL_TYPE",
    );
  }
}

export function antiRaidRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await getAntiRaidConfig(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/settings", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(updateAntiRaidSettingsSchema, req.body ?? {});
      if (typeof body.alertChannelId === "string" && body.alertChannelId.trim()) {
        await assertAlertChannel(bot, body.alertChannelId.trim(), guildId);
      }
      const settings = await updateAntiRaidSettings(body, guildId);
      res.json({ settings });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/lockdown", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(lockdownBodySchema, req.body ?? {});
      const guild = await bot.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        throw new AntiRaidError("Server not found.", 404, "GUILD_NOT_FOUND");
      }
      const settings = await getAntiRaidSettings(guildId);
      const actorId = req.guild?.userId ?? null;
      if (body.active) {
        const result = await applyGuildLockdown(guild, actorId);
        const alert = await resolveAlertChannel(guild, settings);
        await sendAntiRaidAlert(
          alert,
          "Lockdown",
          `Lockdown activated from the panel. Channels: ${result.channels}.`,
        );
      } else {
        const result = await liftGuildLockdown(guild);
        const alert = await resolveAlertChannel(guild, settings);
        await sendAntiRaidAlert(
          alert,
          "Lockdown",
          `Lockdown removed from the panel. Channels: ${result.channels}.`,
        );
      }
      res.json(await getAntiRaidConfig(guildId));
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
