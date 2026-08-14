import { Router } from "express";
import type { Client } from "discord.js";
import type {
  ApiErrorBody,
  CreateAutoroleCompactRequest,
  CreateAutoRoleRequest,
  SaveReactionRolesRequest,
  UpdateAutoroleContentRequest,
  UpdateAutoroleMappingRequest,
} from "@adobos/shared";
import {
  AutoRoleError,
  createAutoRoleSetup,
  normalizeEmojiKey,
  saveReactionRoleMappings,
} from "./controller.js";
import { emojiKeyToResolvable } from "../../../db/reaction-roles.js";
import {
  createAutoroleCompact,
  deleteAutorole,
  listActiveAutoroles,
  updateAutoroleContent,
  updateAutoroleMapping,
} from "../registry.js";

function handleError(
  error: unknown,
  res: import("express").Response,
  label: string,
): void {
  if (error instanceof AutoRoleError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    } satisfies ApiErrorBody);
    return;
  }
  console.error(`[adobos] Error en /api/autoroles/${label}:`, error);
  res.status(500).json({
    error: "Error interno de autoroles.",
    code: "INTERNAL_ERROR",
  } satisfies ApiErrorBody);
}

function isCompactBody(
  body: Record<string, unknown>,
): body is CreateAutoroleCompactRequest & Record<string, unknown> {
  return (
    typeof body.source === "string" &&
    typeof body.type === "string" &&
    Array.isArray(body.mappings)
  );
}

export function autoroleRoutes(bot: Client): Router {
  const router = Router();

  /** GET /api/autoroles/active */
  router.get("/active", async (req, res) => {
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;
    try {
      res.json(await listActiveAutoroles(bot, guildId));
    } catch (error: unknown) {
      handleError(error, res, "active");
    }
  });

  /** POST /api/autoroles/reactions */
  router.post("/reactions", async (req, res) => {
    const body = req.body as Partial<SaveReactionRolesRequest>;

    if (
      typeof body.guildId !== "string" ||
      typeof body.channelId !== "string" ||
      typeof body.messageId !== "string" ||
      !Array.isArray(body.mappings)
    ) {
      res.status(400).json({
        error:
          "Body inválido. Se requieren guildId, channelId, messageId y mappings[].",
        code: "INVALID_BODY",
      } satisfies ApiErrorBody);
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
      handleError(error, res, "reactions");
    }
  });

  /** POST /api/autoroles/create — compacto (preferido) o legacy */
  router.post("/create", async (req, res) => {
    const body = req.body as Record<string, unknown>;

    try {
      if (isCompactBody(body)) {
        if (
          typeof body.guildId !== "string" ||
          typeof body.channelId !== "string"
        ) {
          res.status(400).json({
            error: "Body inválido. Se requieren guildId y channelId.",
            code: "INVALID_BODY",
          } satisfies ApiErrorBody);
          return;
        }
        if (
          body.type !== "BUTTONS" &&
          body.type !== "SELECT" &&
          body.type !== "REACTIONS"
        ) {
          res.status(400).json({
            error: "type debe ser BUTTONS, SELECT o REACTIONS.",
            code: "INVALID_BODY",
          } satisfies ApiErrorBody);
          return;
        }
        if (
          body.source !== "template" &&
          body.source !== "existing" &&
          body.source !== "plain"
        ) {
          res.status(400).json({
            error: "source debe ser template, existing o plain.",
            code: "INVALID_BODY",
          } satisfies ApiErrorBody);
          return;
        }

        const payload: CreateAutoroleCompactRequest = {
          guildId: body.guildId,
          channelId: body.channelId,
          type: body.type,
          source: body.source,
          title: typeof body.title === "string" ? body.title : undefined,
          templateId:
            typeof body.templateId === "number" ? body.templateId : undefined,
          messageId:
            typeof body.messageId === "string" ? body.messageId : undefined,
          plainContent:
            typeof body.plainContent === "string"
              ? body.plainContent
              : undefined,
          mappings: body.mappings as CreateAutoroleCompactRequest["mappings"],
        };

        const result = await createAutoroleCompact(bot, payload);
        res.status(201).json(result);
        return;
      }

      const legacy = body as Partial<CreateAutoRoleRequest>;
      if (
        (legacy.mode !== "buttons" && legacy.mode !== "reactions") ||
        typeof legacy.guildId !== "string" ||
        typeof legacy.channelId !== "string" ||
        (legacy.messageSource !== "existing" &&
          legacy.messageSource !== "create")
      ) {
        res.status(400).json({
          error:
            "Body inválido. Usa el formato compacto (source/type/mappings) o el legacy (mode/messageSource).",
          code: "INVALID_BODY",
        } satisfies ApiErrorBody);
        return;
      }

      const payload: CreateAutoRoleRequest = {
        mode: legacy.mode,
        guildId: legacy.guildId,
        channelId: legacy.channelId,
        messageSource: legacy.messageSource,
        messageId:
          typeof legacy.messageId === "string" ? legacy.messageId : undefined,
        embed:
          legacy.embed && typeof legacy.embed === "object"
            ? legacy.embed
            : undefined,
        reactionMappings: Array.isArray(legacy.reactionMappings)
          ? legacy.reactionMappings
          : undefined,
        buttonMappings: Array.isArray(legacy.buttonMappings)
          ? legacy.buttonMappings
          : undefined,
        title: typeof legacy.title === "string" ? legacy.title : undefined,
      };

      const result = await createAutoRoleSetup(bot, payload);
      res.status(201).json(result);
    } catch (error: unknown) {
      handleError(error, res, "create");
    }
  });

  /** PUT /api/autoroles/update-mapping/:id */
  router.put("/update-mapping/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const body = req.body as Partial<UpdateAutoroleMappingRequest>;
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;

    if (!Array.isArray(body.mappings)) {
      res.status(400).json({
        error: "Body inválido. Se requiere mappings[].",
        code: "INVALID_BODY",
      } satisfies ApiErrorBody);
      return;
    }

    try {
      const result = await updateAutoroleMapping(
        bot,
        id,
        { mappings: body.mappings },
        guildId,
      );
      res.json(result);
    } catch (error: unknown) {
      handleError(error, res, "update-mapping");
    }
  });

  /** PUT /api/autoroles/update-content/:id */
  router.put("/update-content/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const body = req.body as Partial<UpdateAutoroleContentRequest>;
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;

    try {
      const result = await updateAutoroleContent(
        bot,
        id,
        {
          content: typeof body.content === "string" ? body.content : undefined,
          title: typeof body.title === "string" ? body.title : undefined,
          embed:
            body.embed && typeof body.embed === "object" ? body.embed : undefined,
        },
        guildId,
      );
      res.json(result);
    } catch (error: unknown) {
      handleError(error, res, "update-content");
    }
  });

  /** Alias: PUT /api/autoroles/edit-content/:id */
  router.put("/edit-content/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const body = req.body as Partial<UpdateAutoroleContentRequest>;
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;

    try {
      const result = await updateAutoroleContent(
        bot,
        id,
        {
          content: typeof body.content === "string" ? body.content : undefined,
          title: typeof body.title === "string" ? body.title : undefined,
          embed:
            body.embed && typeof body.embed === "object" ? body.embed : undefined,
        },
        guildId,
      );
      res.json(result);
    } catch (error: unknown) {
      handleError(error, res, "edit-content");
    }
  });

  /** DELETE /api/autoroles/delete/:id */
  router.delete("/delete/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const guildId =
      typeof req.query.guildId === "string" ? req.query.guildId : undefined;
    try {
      const result = await deleteAutorole(bot, id, guildId);
      res.json(result);
    } catch (error: unknown) {
      handleError(error, res, "delete");
    }
  });

  return router;
}
