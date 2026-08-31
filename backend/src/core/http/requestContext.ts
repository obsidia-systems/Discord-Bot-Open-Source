import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export interface RequestStore {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

/** Propaga x-request-id a logs (mixin de pino) y a la respuesta. */
export function requestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    const requestId =
      typeof incoming === "string" && incoming.length > 0
        ? incoming
        : randomUUID();
    res.setHeader("x-request-id", requestId);
    requestContext.run({ requestId }, () => next());
  };
}
