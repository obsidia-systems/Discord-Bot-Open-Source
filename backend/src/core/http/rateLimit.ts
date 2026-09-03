import type { Request, RequestHandler } from "express";
import rateLimit, { type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { SESSION_COOKIE } from "../auth/types.js";
import { redisClient } from "../cache/redis.js";

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

/**
 * Store Redis compartido si hay `REDIS_URL` — así el límite es por tenant
 * en todas las réplicas del rol `api`, no N× por réplica. Sin Redis: memoria.
 */
function store(prefix: string): Store | undefined {
  const client = redisClient();
  if (!client) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      client.call(args[0]!, ...args.slice(1)) as Promise<never>,
  });
}

/** Panel autenticado: 120 req/min por sesión (+ guild) o IP. */
export function apiRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipPublic,
    keyGenerator: clientKey,
    validate: { keyGeneratorIpFallback: false },
    store: store("rl:api:"),
    message: {
      error: "Too many requests. Try again in a moment.",
      code: "RATE_LIMITED",
    },
  });
}

/** OAuth: 30 intentos / 15 min por IP. */
export function authRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store: store("rl:auth:"),
    message: {
      error: "Too many login attempts. Wait a few minutes.",
      code: "RATE_LIMITED",
    },
  });
}

/** Subidas: 40 / 15 min por sesión o IP. */
export function uploadRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60_000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    validate: { keyGeneratorIpFallback: false },
    store: store("rl:upload:"),
    message: {
      error: "Too many uploads. Wait a few minutes.",
      code: "RATE_LIMITED",
    },
  });
}
