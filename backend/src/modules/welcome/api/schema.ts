import { z } from "zod";
import { finiteNum, snowflakeNull, snowflakeOpt } from "../../../core/http/schemas.js";

const textLayerSchema = z.object({
  id: z.string(),
  text: z.string(),
  x: finiteNum,
  y: finiteNum,
  fontSize: finiteNum,
  color: z.string(),
  weight: z.enum(["normal", "bold"]),
});

export const saveWelcomeSettingsSchema = z.object({
  guildId: snowflakeOpt,
  channelId: snowflakeNull,
  isEnabled: z.boolean(),
  backgroundUrl: z.string().optional(),
  bgFilepath: z.string().nullable().optional(),
  blurAmount: finiteNum,
  messageContent: z.string().optional(),
  avatarX: finiteNum,
  avatarY: finiteNum,
  avatarSize: finiteNum,
  avatarBorderWidth: finiteNum,
  avatarBorderColor: z.string(),
  textLayers: z.array(textLayerSchema),
});

export const saveCanvasEventSettingsSchema = saveWelcomeSettingsSchema;
