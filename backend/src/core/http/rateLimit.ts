import type { Request } from "express";
import rateLimit from "express-rate-limit";

function skipHealth(req: Request): boolean {
  return req.path === "/health" || req.path.startsWith("/health/");
}

/** Panel autenticado: 120 req/min por IP. */
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealth,
  message: {
    error: "Demasiadas peticiones. Espera un momento.",
    code: "RATE_LIMITED",
  },
});

/** OAuth: 30 intentos / 15 min por IP. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de login. Espera unos minutos.",
    code: "RATE_LIMITED",
  },
});

/** Subidas: 40 / 15 min por IP. */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas subidas. Espera unos minutos.",
    code: "RATE_LIMITED",
  },
});
