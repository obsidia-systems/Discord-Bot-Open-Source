/**
 * Conexión Redis compartida (caché L2 + pub/sub + store de rate-limit).
 * BullMQ (P2.17) abre su propia conexión desde la misma `REDIS_URL`.
 *
 * Sin `REDIS_URL` no se llama a `initRedis` y todo sigue con `MemoryStore` /
 * rate-limit en memoria — el rol `all` y dev no necesitan Redis.
 */

import { Redis } from "ioredis";
import { onShutdown } from "../lifecycle.js";
import { logger } from "../log.js";

let client: Redis | null = null;
let subscriber: Redis | null = null;

export function initRedis(url: string): { client: Redis; subscriber: Redis } {
  if (client && subscriber) return { client, subscriber };

  client = new Redis(url, {
    // Falla rápido: la caché degrada a L1/DB si Redis no responde.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    connectTimeout: 5_000,
  });
  subscriber = new Redis(url, { maxRetriesPerRequest: null });

  for (const [name, conn] of [
    ["client", client],
    ["subscriber", subscriber],
  ] as const) {
    conn.on("error", (err: unknown) => {
      logger.error({ err, conn: name }, "redis: error de conexión");
    });
    conn.on("ready", () => logger.info({ conn: name }, "redis: listo"));
  }

  onShutdown("redis", async () => {
    await Promise.allSettled([client?.quit(), subscriber?.quit()]);
    client = null;
    subscriber = null;
  });

  return { client, subscriber };
}

export function redisClient(): Redis | null {
  return client;
}

export function redisSubscriber(): Redis | null {
  return subscriber;
}

/** URL cruda (para que BullMQ abra su propia conexión). */
export function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}
