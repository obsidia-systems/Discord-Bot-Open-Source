import { Router } from "express";
import { guildIdOf } from "../../../core/http/guildContext.js";
import { HttpError } from "../../../core/http/httpError.js";
import { billingCheckoutSchema } from "./schema.js";
import { parse } from "../../../core/http/validate.js";
import {
  assignCurrentGuild,
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  unassignGuildFromUser,
} from "../service.js";

function userIdOf(req: Parameters<typeof guildIdOf>[0]): string {
  const id = req.guild?.userId ?? req.panelSession?.userId;
  if (!id) {
    throw new HttpError("Missing session.", 401, "UNAUTHENTICATED");
  }
  return id;
}

export function billingRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      res.json(
        await getBillingStatus({
          userId: userIdOf(req),
          guildId: guildIdOf(req),
        }),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/checkout", async (req, res, next) => {
    try {
      const body = parse(billingCheckoutSchema, req.body ?? {});
      res.json(
        await createCheckoutSession({
          userId: userIdOf(req),
          guildId: guildIdOf(req),
          tier: body.tier,
        }),
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/portal", async (req, res, next) => {
    try {
      res.json(await createPortalSession({ userId: userIdOf(req) }));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/assign", async (req, res, next) => {
    try {
      await assignCurrentGuild({
        userId: userIdOf(req),
        guildId: guildIdOf(req),
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/unassign", async (req, res, next) => {
    try {
      await unassignGuildFromUser(guildIdOf(req), userIdOf(req));
      res.json({ ok: true });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
