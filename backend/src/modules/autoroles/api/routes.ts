import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  CreateAutoRoleRequest,
  SaveReactionRolesRequest,
} from "@adobos/shared";
import {
  AutoRoleError,
  createAutoRoleSetup,
  normalizeEmojiKey,
  saveReactionRoleMappings,
} from "./controller.js";
import { emojiKeyToResolvable } from "../../../db/reaction-roles.js";

export function autoroleRoutes(bot: Client): Router {
  const router = Router();

  /** POST /api/autoroles/reactions — registra mappings messageId + emoji → role */
  router.post("/reactions", async (req, res) => {
    const body = req.body as Partial<SaveReactionRolesRequest>;

    if (
      typeof body.guildId !== "string" ||
      typeof body.channelId !== "string" ||
      typeof body.messageId !== "string" ||
      !Array.isArray(body.mappings)
    ) {
      const errorBody: ApiErrorBody = {
        error: "Body inválido. Se requieren guildId, channelId, messageId y mappings[].",
        code: "INVALID_BODY",
      };
      res.status(400).json(errorBody);
      return;
    }

    try {
      const payload: SaveReactionRolesRequest = {
        guildId: body.guildId,
        channelId: body.channelId,
        messageId: body.messageId,
        mappings: body.mappings.map((item) => ({
          emojiKey: typeof item?.emojiKey === "string" ? item.emojiKey : "",
          roleId: typeof item?.roleId === "string" ? item.roleId : "",
        })),
      };

      const result = saveReactionRoleMappings(payload);

      try {
        const channel = await bot.channels.fetch(payload.channelId);
        if (channel && channel.isTextBased() && "messages" in channel) {
          const message = await channel.messages.fetch(payload.messageId);
          for (const mapping of payload.mappings) {
            const key = normalizeEmojiKey(mapping.emojiKey.trim());
            const emoji = emojiKeyToResolvable(key);
            if (!emoji) continue;
            await message.react(emoji).catch(() => undefined);
          }
        }
      } catch (error: unknown) {
        console.warn(
          "[adobos] Mappings guardados, pero no se pudieron añadir reacciones:",
          error,
        );
      }

      res.status(201).json(result);
    } catch (error: unknown) {
      if (error instanceof AutoRoleError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
        } satisfies ApiErrorBody);
        return;
      }

      console.error("[adobos] Error en POST /api/autoroles/reactions:", error);
      res.status(500).json({
        error: "No se pudieron guardar los reaction roles.",
        code: "INTERNAL_ERROR",
      } satisfies ApiErrorBody);
    }
  });

  /** POST /api/autoroles/create — todo en uno */
  router.post("/create", async (req, res) => {
    const body = req.body as Partial<CreateAutoRoleRequest>;

    if (
      (body.mode !== "buttons" && body.mode !== "reactions") ||
      typeof body.guildId !== "string" ||
      typeof body.channelId !== "string" ||
      (body.messageSource !== "existing" && body.messageSource !== "create")
    ) {
      res.status(400).json({
        error:
          "Body inválido. Se requieren mode, guildId, channelId y messageSource.",
        code: "INVALID_BODY",
      } satisfies ApiErrorBody);
      return;
    }

    try {
      const payload: CreateAutoRoleRequest = {
        mode: body.mode,
        guildId: body.guildId,
        channelId: body.channelId,
        messageSource: body.messageSource,
        messageId: typeof body.messageId === "string" ? body.messageId : undefined,
        embed: body.embed && typeof body.embed === "object" ? body.embed : undefined,
        reactionMappings: Array.isArray(body.reactionMappings)
          ? body.reactionMappings
          : undefined,
        buttonMappings: Array.isArray(body.buttonMappings)
          ? body.buttonMappings
          : undefined,
      };

      const result = await createAutoRoleSetup(bot, payload);
      res.status(201).json(result);
    } catch (error: unknown) {
      if (error instanceof AutoRoleError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
        } satisfies ApiErrorBody);
        return;
      }

      console.error("[adobos] Error en POST /api/autoroles/create:", error);
      res.status(500).json({
        error: "No se pudo crear el autorol.",
        code: "INTERNAL_ERROR",
      } satisfies ApiErrorBody);
    }
  });

  return router;
}
