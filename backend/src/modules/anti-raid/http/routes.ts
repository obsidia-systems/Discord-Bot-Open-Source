import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "#core/http/channelScope.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { defineRoute } from "#core/http/validate.js";
import { resolveAlertChannel, sendAntiRaidAlert } from "../alerts.js";
import {
  AntiRaidError,
  getAntiRaidConfig,
  getAntiRaidSettings,
  updateAntiRaidSettings,
} from "../domain/anti-raid.js";
import { applyGuildLockdown, liftGuildLockdown } from "../lockdown.js";
import { lockdownBodySchema, updateAntiRaidSettingsSchema } from "./schema.js";

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

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await getAntiRaidConfig(guildIdOf(req)));
    }),
  );

  router.patch(
    "/settings",
    defineRoute(
      { body: updateAntiRaidSettingsSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        if (
          typeof valid.body.alertChannelId === "string" &&
          valid.body.alertChannelId.trim()
        ) {
          await assertAlertChannel(
            bot,
            valid.body.alertChannelId.trim(),
            guildId,
          );
        }
        const settings = await updateAntiRaidSettings(valid.body, guildId);
        res.json({ settings });
      },
    ),
  );

  router.post(
    "/lockdown",
    defineRoute({ body: lockdownBodySchema }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      const guild = await bot.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        throw new AntiRaidError("Server not found.", 404, "GUILD_NOT_FOUND");
      }
      const settings = await getAntiRaidSettings(guildId);
      const actorId = req.guild?.userId ?? null;
      if (valid.body.active) {
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
    }),
  );

  return router;
}
