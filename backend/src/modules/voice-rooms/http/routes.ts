import { ChannelType } from "discord.js";
import { Router } from "express";
import type { BotGateway } from "#core/discord/botGateway.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
import {
  createGenerator,
  deleteGenerator,
  listVoiceRoomsConfig,
  updateGenerator,
} from "../domain/voice-rooms.js";
import {
  createVoiceRoomGeneratorSchema,
  updateVoiceRoomGeneratorSchema,
} from "./schema.js";

async function assertHubVoice(
  gateway: BotGateway,
  guildId: string,
  hubId: string,
): Promise<void> {
  if (!gateway.isReady()) return;
  const channel = await gateway.getChannel(guildId, hubId);
  if (!channel) return;
  if (channel.type !== ChannelType.GuildVoice) {
    throw Object.assign(new Error("The hub has to be a voice channel."), {
      status: 400,
      code: "INVALID_HUB_TYPE",
    });
  }
}

async function assertCategory(
  gateway: BotGateway,
  guildId: string,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId || !gateway.isReady()) return;
  const channel = await gateway.getChannel(guildId, categoryId);
  if (!channel) return;
  if (channel.type !== ChannelType.GuildCategory) {
    throw Object.assign(new Error("The destination has to be a category."), {
      status: 400,
      code: "INVALID_CATEGORY_TYPE",
    });
  }
}

export function voiceRoomsRoutes(gateway: BotGateway): Router {
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
        await assertHubVoice(gateway, guildId, valid.body.hubChannelId);
        await assertCategory(gateway, guildId, valid.body.categoryId);
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
          await assertHubVoice(gateway, guildId, valid.body.hubChannelId);
        }
        if (valid.body.categoryId !== undefined) {
          await assertCategory(gateway, guildId, valid.body.categoryId);
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
      for (const room of rooms) {
        if (room.textChannelId) {
          await gateway.deleteChannel(
            guildId,
            room.textChannelId,
            "Voice Rooms: generator removed",
          );
        }
        await gateway.deleteChannel(
          guildId,
          room.channelId,
          "Voice Rooms: generator removed",
        );
      }
      res.status(204).send();
    }),
  );

  return router;
}
