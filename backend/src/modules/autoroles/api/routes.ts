import { Router } from "express";
import type { Client } from "discord.js";
import {
  AutoRoleError,
  createAutoRoleSetup,
  normalizeEmojiKey,
  saveReactionRoleMappings,
} from "./controller.js";
import { emojiKeyToResolvable } from "../../../db/reaction-roles.js";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { recordId } from "../../../core/http/schemas.js";
import {
  createAutoRoleLegacySchema,
  createAutoroleCompactSchema,
  saveReactionRolesSchema,
  updateAutoroleContentSchema,
  updateAutoroleMappingSchema,
} from "./schema.js";
import { fetchChannelInGuild } from "../../../core/http/channelScope.js";
import { logger } from "../../../core/log.js";
import { isAutoroleSendChannelType } from "@adobos/shared";
import {
  createAutoroleCompact,
  deleteAutorole,
  listActiveAutoroles,
  updateAutoroleContent,
  updateAutoroleMapping,
} from "../registry.js";

export function autoroleRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/autoroles/active */
  router.get("/active", async (req, res, next) => {
    const guildId =
      guildIdOf(req);
    try {
      res.json(await listActiveAutoroles(bot, guildId));
    } catch (error: unknown) {
      next(error);
    }
  });

  /** POST /api/autoroles/reactions */
  router.post("/reactions", async (req, res, next) => {
    try {
      const body = parse(saveReactionRolesSchema, req.body);
      const payload = {
        guildId: guildIdOf(req),
        channelId: body.channelId,
        messageId: body.messageId,
        mappings: body.mappings,
      };

      const channel = await fetchChannelInGuild(
        bot,
        payload.channelId,
        payload.guildId,
      );
      if (
        !channel.isTextBased() ||
        !("messages" in channel) ||
        !isAutoroleSendChannelType(channel.type)
      ) {
        throw new AutoRoleError(
          "The channel does not support text messages.",
          400,
          "CHANNEL_NOT_TEXT",
        );
      }
      const message = await channel.messages
        .fetch(payload.messageId)
        .catch(() => null);
      if (!message) {
        throw new AutoRoleError(
          "That message was not found in the channel.",
          404,
          "MESSAGE_NOT_FOUND",
        );
      }

      const result = await saveReactionRoleMappings(payload, bot);

      try {
        for (const mapping of payload.mappings) {
          const key = normalizeEmojiKey(mapping.emojiKey.trim());
          const emoji = emojiKeyToResolvable(key);
          if (!emoji) continue;
          await message.react(emoji).catch(() => undefined);
        }
      } catch (error: unknown) {
        logger.warn({ err: error }, "Mappings saved, but reactions couldn't be added:");
      }

      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** POST /api/autoroles/create — compacto (preferido) o legacy */
  router.post("/create", async (req, res, next) => {
    try {
      const raw = req.body as Record<string, unknown> | undefined;
      if (raw && typeof raw.type === "string") {
        const payload = parse(createAutoroleCompactSchema, raw);
        const result = await createAutoroleCompact(bot, {
          ...payload,
          guildId: guildIdOf(req),
        });
        res.status(201).json(result);
        return;
      }

      const payload = parse(createAutoRoleLegacySchema, raw);
      const result = await createAutoRoleSetup(bot, {
        ...payload,
        guildId: guildIdOf(req),
      });
      res.status(201).json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** PUT /api/autoroles/update-mapping/:id */
  router.put("/update-mapping/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      const body = parse(updateAutoroleMappingSchema, req.body);
      const result = await updateAutoroleMapping(bot, id, body, guildIdOf(req));
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** PUT /api/autoroles/update-content/:id */
  router.put("/update-content/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      const body = parse(updateAutoroleContentSchema, req.body);
      const result = await updateAutoroleContent(bot, id, body, guildIdOf(req));
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** Alias: PUT /api/autoroles/edit-content/:id */
  router.put("/edit-content/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      const body = parse(updateAutoroleContentSchema, req.body);
      const result = await updateAutoroleContent(bot, id, body, guildIdOf(req));
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  /** DELETE /api/autoroles/delete/:id */
  router.delete("/delete/:id", async (req, res, next) => {
    try {
      const id = parse(recordId, req.params.id);
      const result = await deleteAutorole(bot, id, guildIdOf(req));
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
