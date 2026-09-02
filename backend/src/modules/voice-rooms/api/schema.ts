import { z } from "zod";
import { VOICE_ROOM_ACTIONS } from "@adobos/shared";
import {
  boolish,
  nonNegInt,
  snowflake,
  snowflakeNull,
} from "../../../core/http/schemas.js";

const actionsSchema = z
  .object(
    Object.fromEntries(VOICE_ROOM_ACTIONS.map((key) => [key, z.boolean()])) as {
      [K in (typeof VOICE_ROOM_ACTIONS)[number]]: z.ZodBoolean;
    },
  )
  .partial();

export const createVoiceRoomGeneratorSchema = z.object({
  hubChannelId: snowflake,
  categoryId: snowflakeNull,
  nameTemplate: z.string().max(100).optional(),
  defaultUserLimit: nonNegInt.max(99).optional(),
  defaultBitrate: nonNegInt.max(384).optional(),
  autoText: boolish.optional(),
  enabled: boolish.optional(),
  allowedActions: actionsSchema.optional(),
});

export const updateVoiceRoomGeneratorSchema =
  createVoiceRoomGeneratorSchema.partial();
