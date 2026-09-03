import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import { destroyVoicePair } from "../rooms.js";
import {
  createGenerator,
  deleteGenerator,
  listVoiceRoomsConfig,
  updateGenerator,
} from "../service.js";
import {
  createVoiceRoomGeneratorSchema,
  updateVoiceRoomGeneratorSchema,
} from "./schema.js";

function assertHubVoice(bot: Client, guildId: string, hubId: string): void {
  if (!bot.isReady()) return;
  const guild = bot.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(hubId);
  if (!channel) return;
  if (channel.type !== ChannelType.GuildVoice) {
    throw Object.assign(new Error("The hub has to be a voice channel."), {
      status: 400,
      code: "INVALID_HUB_TYPE",
    });
  }
}

function assertCategory(
  bot: Client,
  guildId: string,
  categoryId: string | null | undefined,
): void {
  if (!categoryId || !bot.isReady()) return;
  const guild = bot.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(categoryId);
  if (!channel) return;
  if (channel.type !== ChannelType.GuildCategory) {
    throw Object.assign(new Error("The destination has to be a category."), {
      status: 400,
      code: "INVALID_CATEGORY_TYPE",
    });
  }
}

export function voiceRoomsRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/",
    defineRoute({}, async (req, res) => {
      res.json(await listVoiceRoomsConfig(guildIdOf(req)));
    }),
  );

  router.post(
    "/generators",
    defineRoute(
      { body: createVoiceRoomGeneratorSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        assertHubVoice(bot, guildId, valid.body.hubChannelId);
        assertCategory(bot, guildId, valid.body.categoryId);
        const generator = await createGenerator(valid.body, guildId);
        res.status(201).json({ generator });
      },
    ),
  );

  router.patch(
    "/generators/:id",
    defineRoute(
      { params: idParams, body: updateVoiceRoomGeneratorSchema },
      async (req, res, valid) => {
        const guildId = guildIdOf(req);
        if (valid.body.hubChannelId) {
          assertHubVoice(bot, guildId, valid.body.hubChannelId);
        }
        if (valid.body.categoryId !== undefined) {
          assertCategory(bot, guildId, valid.body.categoryId);
        }
        const generator = await updateGenerator(
          valid.params.id,
          valid.body,
          guildId,
        );
        res.json({ generator });
      },
    ),
  );

  router.delete(
    "/generators/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guildId = guildIdOf(req);
      const rooms = await deleteGenerator(valid.params.id, guildId);
      if (bot.isReady()) {
        const guild = bot.guilds.cache.get(guildId);
        if (guild) {
          for (const room of rooms) {
            await destroyVoicePair(guild, room).catch(() => null);
          }
        }
      }
      res.status(204).send();
    }),
  );

  return router;
}
