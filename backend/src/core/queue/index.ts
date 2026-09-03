/**
 * Abstracción de cola de trabajo.
 *
 * - Con `REDIS_URL`: BullMQ. El productor (líder) hace `add()`; N procesos del
 *   rol `worker` consumen con `process()`.
 * - Sin `REDIS_URL`: modo inline — `add()` ejecuta el handler en el acto
 *   (mismo comportamiento que el bucle de polling de hoy, un solo proceso).
 *
 * El código de módulo solo ve `defineQueue<T>(name)` y no sabe cuál está activo.
 */

import { Queue, Worker } from "bullmq";
import { redisUrl } from "#core/cache/redis.js";
import { onShutdown } from "#core/lifecycle.js";
import { logger } from "#core/log.js";
import { roleRunsWorker } from "#core/runtime/index.js";
import { newBullConnection } from "./connection.js";

export interface QueueHandle<T> {
  /** Encola (BullMQ) o ejecuta el handler ahora mismo (inline). */
  add(data: T, opts?: { jobId?: string }): Promise<void>;
  /** Registra el procesador. En BullMQ solo arranca Worker si el rol es `worker`. */
  process(handler: (data: T) => Promise<void>): void;
}

const WORKER_CONCURRENCY = 4;
const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export function defineQueue<T>(name: string): QueueHandle<T> {
  const useRedis = Boolean(redisUrl());
  let handler: ((data: T) => Promise<void>) | null = null;
  let queue: Queue | null = null;
  let worker: Worker | null = null;

  function ensureQueue(): Queue | null {
    if (queue) return queue;
    const connection = newBullConnection();
    if (!connection) return null;
    queue = new Queue(name, { connection });
    onShutdown(`queue:${name}`, () => queue?.close());
    return queue;
  }

  return {
    async add(data, opts) {
      if (useRedis) {
        const q = ensureQueue();
        if (q) {
          await q.add(name, data, { ...DEFAULT_JOB_OPTS, jobId: opts?.jobId });
          return;
        }
        logger.warn(
          { queue: name },
          "queue: sin conexión Redis, ejecuto inline",
        );
      }
      if (!handler) {
        logger.error({ queue: name }, "queue.add sin handler registrado");
        return;
      }
      try {
        await handler(data);
      } catch (err) {
        logger.warn({ err, queue: name }, "queue: job inline falló");
      }
    },

    process(fn) {
      handler = fn;
      if (!useRedis || worker || !roleRunsWorker()) return;
      const connection = newBullConnection();
      if (!connection) return;
      worker = new Worker(
        name,
        async (job) => {
          await fn(job.data as T);
        },
        { connection, concurrency: WORKER_CONCURRENCY },
      );
      worker.on("failed", (job, err) => {
        logger.warn(
          { err, queue: name, jobId: job?.id, attempts: job?.attemptsMade },
          "queue: job falló",
        );
      });
      onShutdown(`worker:${name}`, () => worker?.close());
      logger.info({ queue: name }, "queue: worker BullMQ activo");
    },
  };
}
