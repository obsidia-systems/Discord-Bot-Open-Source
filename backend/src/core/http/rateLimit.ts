import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { SESSION_COOKIE } from "../auth/types.js";

function skipPublic(req: Request): boolean {
  return (
    req.path === "/health" ||
    req.path.startsWith("/health/") ||
    req.path === "/billing/webhook"
  );
}

function clientKey(req: Request): string {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const sid =
    typeof cookies?.[SESSION_COOKIE] === "string"
      ? cookies[SESSION_COOKIE]
      : "";
  const guild =
    typeof req.query.guildId === "string"
      ? req.query.guildId
      : typeof req.params.guildId === "string"
        ? req.params.guildId
        : "";
  if (sid && guild) return `s:${sid}:g:${guild}`;
  if (sid) return `s:${sid}`;
  return req.ip ?? "unknown";
}

/** Panel autenticado: 120 req/min por sesión (+ guild) o IP. */
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPublic,
  keyGenerator: clientKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: "Too many requests. Try again in a moment.",
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
    error: "Too many login attempts. Wait a few minutes.",
    code: "RATE_LIMITED",
  },
});

/** Subidas: 40 / 15 min por sesión o IP. */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: "Too many uploads. Wait a few minutes.",
    code: "RATE_LIMITED",
  },
});
