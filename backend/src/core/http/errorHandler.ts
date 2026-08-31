import type { ErrorRequestHandler, RequestHandler } from "express";
import { logger } from "../log.js";
import { mapHttpError } from "./httpError.js";

export const notFoundHandler: RequestHandler = (req, res, next) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/auth")) {
    next();
    return;
  }
  res.status(404).json({ error: "No encontrado.", code: "NOT_FOUND" });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const mapped = mapHttpError(error);
  if (mapped.log) {
    logger.error(
      {
        err: error,
        method: req.method,
        url: req.originalUrl,
        guildId: req.guild?.guildId,
        userId: req.panelSession?.userId,
      },
      "Error HTTP no controlado",
    );
  } else if (mapped.status >= 500) {
    logger.warn(
      {
        err: error,
        method: req.method,
        url: req.originalUrl,
        code: mapped.body.code,
      },
      "Error HTTP 5xx de dominio",
    );
  }

  res.status(mapped.status).json(mapped.body);
};
