import {
  isTicketStatus,
  normalizeTicketCloseReason,
  parseTicketUserMention,
} from "@adobos/shared";
import type { Client } from "discord.js";
import { Router } from "express";
import { z } from "zod";
import { guildIdOf } from "#core/http/guildContext.js";
import { idParams } from "#core/http/schemas.js";
import { defineRoute } from "#core/http/validate.js";
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
  createTicketPanel,
  deleteTicketPanel,
  getTicketDetail,
  getTicketSettings,
  listTicketPanels,
  listTickets,
  TicketsError,
  updateTicketPanel,
  updateTicketSettings,
} from "../domain/tickets.js";
import { publishTicketPanel } from "../publish.js";
import {
  closeTicketSchema,
  createTicketPanelSchema,
  ticketUserSchema,
  updateTicketPanelSchema,
  updateTicketSettingsSchema,
} from "./schema.js";

const ticketListQuery = z.object({
  status: z.string().optional(),
  typeKey: z.string().optional(),
  openerId: z.string().optional(),
  claimedBy: z.string().optional(),
});
const participantParams = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.string(),
});

function actorIdOf(req: Parameters<typeof guildIdOf>[0]): string {
  const id = req.guild?.userId;
  if (!id) {
    throw new TicketsError("Missing panel user.", 401, "UNAUTHENTICATED");
  }
  return id;
}

async function actorMember(bot: Client, guildId: string, userId: string) {
  const guild = await requireGuild(bot, guildId);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new TicketsError(
      "You are not in this server or the bot can't see you.",
      400,
      "MEMBER_NOT_FOUND",
    );
  }
  return { guild, member };
}

export function ticketsRoutes(bot: Client): Router {
  const router = Router();

  router.get(
    "/settings",
    defineRoute({}, async (req, res) => {
      res.json({ settings: await getTicketSettings(guildIdOf(req)) });
    }),
  );

  router.put(
    "/settings",
    defineRoute(
      { body: updateTicketSettingsSchema },
      async (req, res, valid) => {
        const settings = await updateTicketSettings(valid.body, guildIdOf(req));
        res.json({ settings });
      },
    ),
  );

  router.get(
    "/panels",
    defineRoute({}, async (req, res) => {
      res.json({ panels: await listTicketPanels(guildIdOf(req)) });
    }),
  );

  router.post(
    "/panels",
    defineRoute({ body: createTicketPanelSchema }, async (req, res, valid) => {
      const panel = await createTicketPanel(valid.body, guildIdOf(req));
      res.status(201).json({ panel });
    }),
  );

  router.patch(
    "/panels/:id",
    defineRoute(
      { params: idParams, body: updateTicketPanelSchema },
      async (req, res, valid) => {
        const panel = await updateTicketPanel(
          valid.params.id,
          valid.body,
          guildIdOf(req),
        );
        res.json({ panel });
      },
    ),
  );

  router.delete(
    "/panels/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      await deleteTicketPanel(valid.params.id, guildIdOf(req));
      res.status(204).send();
    }),
  );

  router.post(
    "/panels/:id/publish",
    defineRoute(
      { params: idParams, body: updateTicketPanelSchema },
      async (req, res, valid) => {
        const result = await publishTicketPanel(
          bot,
          valid.params.id,
          guildIdOf(req),
          valid.body,
        );
        res.json(result);
      },
    ),
  );

  router.get(
    "/",
    defineRoute({ query: ticketListQuery }, async (req, res, valid) => {
      const status =
        valid.query.status && isTicketStatus(valid.query.status)
          ? valid.query.status
          : undefined;
      res.json(
        await listTickets(guildIdOf(req), {
          status,
          typeKey: valid.query.typeKey,
          openerId: valid.query.openerId,
          claimedBy: valid.query.claimedBy,
        }),
      );
    }),
  );

  router.get(
    "/:id",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      res.json({
        ticket: await getTicketDetail(valid.params.id, guildIdOf(req)),
      });
    }),
  );

  router.post(
    "/:id/claim",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const { guild, member } = await actorMember(
        bot,
        guildIdOf(req),
        actorIdOf(req),
      );
      const ticket = await claimTicket({
        guild,
        ticketId: valid.params.id,
        actor: member,
      });
      res.json({ ticket });
    }),
  );

  router.post(
    "/:id/unclaim",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await unclaimTicket({
        guild,
        ticketId: valid.params.id,
        actorId: actorIdOf(req),
      });
      res.json({ ticket });
    }),
  );

  router.post(
    "/:id/wait",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await waitTicket({
        guild,
        ticketId: valid.params.id,
        actorId: actorIdOf(req),
      });
      res.json({ ticket });
    }),
  );

  router.post(
    "/:id/unwait",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await unwaitTicket({
        guild,
        ticketId: valid.params.id,
        actorId: actorIdOf(req),
      });
      res.json({ ticket });
    }),
  );

  router.post(
    "/:id/close",
    defineRoute(
      { params: idParams, body: closeTicketSchema },
      async (req, res, valid) => {
        const reason = normalizeTicketCloseReason(valid.body.reason);
        if (!reason) {
          throw new TicketsError(
            "The close reason is required.",
            400,
            "MISSING_CLOSE_REASON",
          );
        }
        const guild = await requireGuild(bot, guildIdOf(req));
        const ticket = await closeTicket({
          guild,
          ticketId: valid.params.id,
          actorId: actorIdOf(req),
          reason,
        });
        res.json({ ticket });
      },
    ),
  );

  router.post(
    "/:id/reopen",
    defineRoute({ params: idParams }, async (req, res, valid) => {
      const { guild, member } = await actorMember(
        bot,
        guildIdOf(req),
        actorIdOf(req),
      );
      const ticket = await reopenTicket({
        guild,
        ticketId: valid.params.id,
        actor: member,
      });
      res.json({ ticket });
    }),
  );

  router.post(
    "/:id/participants",
    defineRoute(
      { params: idParams, body: ticketUserSchema },
      async (req, res, valid) => {
        const userId = parseTicketUserMention(valid.body.userId);
        if (!userId) {
          throw new TicketsError("Invalid user.", 400, "INVALID_USER");
        }
        const guild = await requireGuild(bot, guildIdOf(req));
        const ticket = await addUserToTicket({
          guild,
          ticketId: valid.params.id,
          actorId: actorIdOf(req),
          userId,
        });
        res.json({ ticket });
      },
    ),
  );

  router.delete(
    "/:id/participants/:userId",
    defineRoute({ params: participantParams }, async (req, res, valid) => {
      const userId = parseTicketUserMention(valid.params.userId);
      if (!userId) {
        throw new TicketsError("Invalid user.", 400, "INVALID_USER");
      }
      const guild = await requireGuild(bot, guildIdOf(req));
      const ticket = await removeUserFromTicket({
        guild,
        ticketId: valid.params.id,
        actorId: actorIdOf(req),
        userId,
      });
      res.json({ ticket });
    }),
  );

  return router;
}
