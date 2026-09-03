/**
 * Conexiones Redis dedicadas para BullMQ. Separadas de la caché: los workers
 * de BullMQ bloquean su conexión (BRPOPLPUSH) y necesitan `maxRetriesPerRequest: null`.
 */

import { Redis } from "ioredis";
import { redisUrl } from "#core/cache/redis.js";
import { onShutdown } from "#core/lifecycle.js";
import { logger } from "#core/log.js";

const conns: Redis[] = [];
let shutdownHooked = false;

/** Crea una conexión nueva para un Queue/Worker de BullMQ. `null` si no hay Redis. */
export function newBullConnection(): Redis | null {
  const url = redisUrl();
  if (!url) return null;

  const conn = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  conn.on("error", (err: unknown) => {
    logger.error({ err }, "bullmq: error de conexión Redis");
  });
  conns.push(conn);

  if (!shutdownHooked) {
    shutdownHooked = true;
    onShutdown("bullmq-connections", async () => {
      await Promise.allSettled(conns.map((c) => c.quit()));
      conns.length = 0;
    });
  }

  return conn;
}
