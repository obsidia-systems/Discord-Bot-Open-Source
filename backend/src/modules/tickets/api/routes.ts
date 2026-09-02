import { Router } from "express";
import type { Client } from "discord.js";
import {
  isTicketStatus,
  normalizeTicketCloseReason,
  parseTicketUserMention,
} from "@adobos/shared";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { parse } from "../../../core/http/validate.js";
import { recordId } from "../../../core/http/schemas.js";
import { TicketsError } from "../service.js";
import {
  createTicketPanel,
  deleteTicketPanel,
  getTicketDetail,
  getTicketSettings,
  listTicketPanels,
  listTickets,
  updateTicketPanel,
  updateTicketSettings,
} from "../service.js";
import { publishTicketPanel } from "../publish.js";
import {
  addUserToTicket,
  claimTicket,
  closeTicket,
  removeUserFromTicket,
  reopenTicket,
  requireGuild,
  unclaimTicket,
  unwaitTicket,
  waitTicket,
} from "../actions.js";
import {
  closeTicketSchema,
  createTicketPanelSchema,
  ticketUserSchema,
  updateTicketPanelSchema,
  updateTicketSettingsSchema,
} from "./schema.js";

function actorIdOf(req: Parameters<typeof guildIdOf>[0]): string {
  const id = req.guild?.userId;
  if (!id) {
    throw new TicketsError("Falta el usuario del panel.", 401, "UNAUTHENTICATED");
  }
  return id;
}

async function actorMember(bot: Client, guildId: string, userId: string) {
  const guild = await requireGuild(bot, guildId);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new TicketsError(
      "No estás en este servidor o el bot no puede verte.",
      400,
      "MEMBER_NOT_FOUND",
    );
  }
  return { guild, member };
}

export function ticketsRoutes(bot: Client): Router {
  const router = Router();

  router.get("/settings", async (req, res, next) => {
    try {
      res.json({ settings: await getTicketSettings(guildIdOf(req)) });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.put("/settings", async (req, res, next) => {
    try {
      const settings = await updateTicketSettings(
        parse(updateTicketSettingsSchema, req.body ?? {}),
        guildIdOf(req),
      );
      res.json({ settings });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/panels", async (req, res, next) => {
    try {
      res.json({ panels: await listTicketPanels(guildIdOf(req)) });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/panels", async (req, res, next) => {
    try {
      const panel = await createTicketPanel(
        parse(createTicketPanelSchema, req.body ?? {}),
        guildIdOf(req),
      );
      res.status(201).json({ panel });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.patch("/panels/:id", async (req, res, next) => {
    try {
      const panel = await updateTicketPanel(
        parse(recordId, req.params.id),
        parse(updateTicketPanelSchema, req.body ?? {}),
        guildIdOf(req),
      );
      res.json({ panel });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/panels/:id", async (req, res, next) => {
    try {
      await deleteTicketPanel(parse(recordId, req.params.id), guildIdOf(req));
      res.status(204).send();
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/panels/:id/publish", async (req, res, next) => {
    try {
      const result = await publishTicketPanel(
        bot,
        parse(recordId, req.params.id),
        guildIdOf(req),
        parse(updateTicketPanelSchema, req.body ?? {}),
      );
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = statusRaw && isTicketStatus(statusRaw) ? statusRaw : undefined;
      const typeKey =
        typeof req.query.typeKey === "string" ? req.query.typeKey : undefined;
      const openerId =
        typeof req.query.openerId === "string" ? req.query.openerId : undefined;
      const claimedBy =
        typeof req.query.claimedBy === "string" ? req.query.claimedBy : undefined;
      res.json(
        await listTickets(guildIdOf(req), {
          status,
          typeKey,
          openerId,
          claimedBy,
        }),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      res.json({
        ticket: await getTicketDetail(parse(recordId, req.params.id), guildIdOf(req)),
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/claim", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const { guild, member } = await actorMember(bot, guildId, actorIdOf(req));
      const ticket = await claimTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actor: member,
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/unclaim", async (req, res, next) => {
    try {
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await unclaimTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actorId: actorIdOf(req),
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/wait", async (req, res, next) => {
    try {
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await waitTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actorId: actorIdOf(req),
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/unwait", async (req, res, next) => {
    try {
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await unwaitTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actorId: actorIdOf(req),
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/close", async (req, res, next) => {
    try {
      const reason = normalizeTicketCloseReason(
        parse(closeTicketSchema, req.body ?? {}).reason,
      );
      if (!reason) {
        throw new TicketsError(
          "El motivo de cierre es obligatorio.",
          400,
          "MISSING_CLOSE_REASON",
        );
      }
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await closeTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actorId: actorIdOf(req),
        reason,
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/reopen", async (req, res, next) => {
    try {
      const guildId = guildIdOf(req);
      const { guild, member } = await actorMember(bot, guildId, actorIdOf(req));
      const ticket = await reopenTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actor: member,
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/:id/participants", async (req, res, next) => {
    try {
      const userId = parseTicketUserMention(
        parse(ticketUserSchema, req.body ?? {}).userId,
      );
      if (!userId) {
        throw new TicketsError("Usuario inválido.", 400, "INVALID_USER");
      }
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await addUserToTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actorId: actorIdOf(req),
        userId,
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/:id/participants/:userId", async (req, res, next) => {
    try {
      const userId = parseTicketUserMention(req.params.userId);
      if (!userId) {
        throw new TicketsError("Usuario inválido.", 400, "INVALID_USER");
      }
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await removeUserFromTicket({
        guild,
        ticketId: parse(recordId, req.params.id),
        actorId: actorIdOf(req),
        userId,
      });
      res.json({ ticket });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
