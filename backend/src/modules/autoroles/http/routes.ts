import { isAutoroleSendChannelType } from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { fetchChannelInGuild } from "#core/http/channelScope.js";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute, parse } from "#core/http/validate.js";
import { logger } from "#core/log.js";
import { emojiKeyToResolvable } from "#db/reaction-roles.js";
import {
  createAutoroleCompact,
  deleteAutorole,
  listActiveAutoroles,
  updateAutoroleContent,
  updateAutoroleMapping,
} from "../registry.js";
import {
  AutoRoleError,
  createAutoRoleSetup,
  normalizeEmojiKey,
  saveReactionRoleMappings,
} from "./controller.js";
import {
  createAutoRoleLegacySchema,
  createAutoroleCompactSchema,
  saveReactionRolesSchema,
  updateAutoroleContentSchema,
  updateAutoroleMappingSchema,
} from "./schema.js";

export function autoroleRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/autoroles/active */
  router.get(
    "/active",
    defineRoute({}, async (req, res) => {
      res.json(await listActiveAutoroles(bot, guildIdOf(req)));
    }),
  );

  /** POST /api/autoroles/reactions */
  router.post(
    "/reactions",
    defineRoute({ body: saveReactionRolesSchema }, async (req, res, valid) => {
      const payload = {
        guildId: guildIdOf(req),
        channelId: valid.body.channelId,
        messageId: valid.body.messageId,
        mappings: valid.body.mappings,
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
        logger.warn(
          { err: error },
          "Mappings saved, but reactions couldn't be added:",
        );
      }

      res.status(201).json(result);
    }),
  );

  /** POST /api/autoroles/create — compacto (preferido) o legacy */
  router.post(
    "/create",
    defineRoute({}, async (req, res) => {
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
    }),
  );

  /** PUT /api/autoroles/update-mapping/:id */
  router.put(
    "/update-mapping/:id",
    defineRoute(
      { params: idParams, body: updateAutoroleMappingSchema },
      async (req, res, valid) => {
        const result = await updateAutoroleMapping(
          bot,
          valid.params.id,
          valid.body,
          guildIdOf(req),
        );
        res.json(result);
      },
    ),
  );

  /** PUT /api/autoroles/update-content/:id */
  router.put(
    "/update-content/:id",
    defineRoute(
      { params: idParams, body: updateAutoroleContentSchema },
      async (req, res, valid) => {
        const result = await updateAutoroleContent(
          bot,
          valid.params.id,
          valid.body,
          guildIdOf(req),
        );
        res.json(result);
      },
    ),
  );

  /** Alias: PUT /api/autoroles/edit-content/:id */
  router.put(
    "/edit-content/:id",
    defineRoute(
      { params: idParams, body: updateAutoroleContentSchema },
      async (req, res, valid) => {
        const result = await updateAutoroleContent(
          bot,
          valid.params.id,
          valid.body,
          guildIdOf(req),
        );
        res.json(result);
      },
    ),
  );

  /** DELETE /api/autoroles/delete/:id */
  router.delete(
    "/delete/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const result = await deleteAutorole(bot, valid.params.id, guildIdOf(req));
      res.json(result);
    }),
  );

  return router;
}
