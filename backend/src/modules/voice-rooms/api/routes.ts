import { ChannelType, type Client } from "discord.js";
import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { recordId } from "../../../core/http/schemas.js";
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
    throw Object.assign(new Error("El hub tiene que ser un canal de voz."), {
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
    throw Object.assign(new Error("El destino tiene que ser una categoría."), {
      status: 400,
      code: "INVALID_CATEGORY_TYPE",
    });
  }
}

export function voiceRoomsRoutes(bot: Client): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(await listVoiceRoomsConfig(guildIdOf(req)));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/generators", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const body = parse(createVoiceRoomGeneratorSchema, req.body ?? {});
      assertHubVoice(bot, guildId, body.hubChannelId);
      assertCategory(bot, guildId, body.categoryId);
      const generator = await createGenerator(body, guildId);
      res.status(201).json({ generator });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/generators/:id", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const id = parse(recordId, req.params.id);
      const body = parse(updateVoiceRoomGeneratorSchema, req.body ?? {});
      if (body.hubChannelId) assertHubVoice(bot, guildId, body.hubChannelId);
      if (body.categoryId !== undefined) {
        assertCategory(bot, guildId, body.categoryId);
      }
      const generator = await updateGenerator(id, body, guildId);
      res.json({ generator });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/generators/:id", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const id = parse(recordId, req.params.id);
      const rooms = await deleteGenerator(id, guildId);
      if (bot.isReady()) {
        const guild = bot.guilds.cache.get(guildId);
        if (guild) {
          for (const room of rooms) {
            await destroyVoicePair(guild, room).catch(() => null);
          }
        }
      }
      res.status(204).send();
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
