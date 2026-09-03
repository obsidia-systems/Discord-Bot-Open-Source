/**
 * Pool de `worker_threads` para el render de tarjetas de bienvenida.
 *
 * `@napi-rs/canvas` rasteriza y codifica el PNG de forma **síncrona** en el hilo
 * que lo llama. En el proceso del gateway eso bloquea los heartbeats del
 * WebSocket ante una ráfaga de `guildMemberAdd`; en el rol `api` bloquea el
 * event loop HTTP. Este pool saca ese trabajo del hilo principal.
 *
 * Degradación: si un worker no arranca (entornos restringidos) o
 * `WELCOME_CARD_INLINE=1`, se cae a ejecutar `buildWelcomeCard` en el hilo
 * actual — lento pero correcto.
 */

import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import {
  type BuildWelcomeCardOptions,
  buildWelcomeCard,
} from "../../modules/welcome/card/WelcomeCardBuilder.js";
import { onShutdown } from "../lifecycle.js";
import { logger } from "../log.js";

interface WorkerReply {
  id: number;
  ok: boolean;
  png?: Buffer;
  error?: string;
}

interface Pending {
  resolve: (png: Buffer) => void;
  reject: (err: Error) => void;
}

const POOL_SIZE = Math.max(1, Math.min(2, availableParallelism() - 1));

function workerUrl(): URL {
  // tsx parchea `worker_threads` para cargar `.ts` en dev; en prod es `.js`.
  const ext = import.meta.url.endsWith(".ts") ? "ts" : "js";
  return new URL(`./welcomeCard.worker.${ext}`, import.meta.url);
}

let pool: Worker[] | null = null;
let nextWorker = 0;
let disabled = process.env.WELCOME_CARD_INLINE === "1";
let jobSeq = 0;
const pending = new Map<number, Pending>();

function spawnPool(): Worker[] {
  const url = workerUrl();
  const workers: Worker[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const worker = new Worker(url);
    worker.on("message", (reply: WorkerReply) => {
      const job = pending.get(reply.id);
      if (!job) return;
      pending.delete(reply.id);
      if (reply.ok && reply.png) job.resolve(Buffer.from(reply.png));
      else job.reject(new Error(reply.error ?? "welcome-card worker failed"));
    });
    worker.on("error", (err) => {
      logger.error({ err }, "welcome-card worker: error; se desactiva el pool");
      disabled = true;
    });
    worker.unref();
    workers.push(worker);
  }
  onShutdown("welcome-card-pool", async () => {
    await Promise.all(workers.map((w) => w.terminate()));
  });
  logger.info(`welcome-card: pool de ${workers.length} worker(s)`);
  return workers;
}

function ensurePool(): Worker[] | null {
  if (disabled) return null;
  if (pool) return pool;
  try {
    pool = spawnPool();
    return pool;
  } catch (err) {
    logger.error(
      { err },
      "welcome-card: no se pudo crear el pool; render inline",
    );
    disabled = true;
    return null;
  }
}

/** Render de la tarjeta fuera del hilo principal (con fallback inline). */
export function renderWelcomeCard(
  options: BuildWelcomeCardOptions,
): Promise<Buffer> {
  const workers = ensurePool();
  if (!workers) return buildWelcomeCard(options);

  const worker = workers[nextWorker % workers.length];
  nextWorker += 1;
  if (!worker) return buildWelcomeCard(options);

  const id = ++jobSeq;
  return new Promise<Buffer>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, options });
  }).catch((err: unknown) => {
    logger.warn({ err }, "welcome-card: worker falló, render inline");
    return buildWelcomeCard(options);
  });
}

/** Solo para tests / diagnóstico. */
export function welcomeCardPoolSize(): number {
  return disabled ? 0 : POOL_SIZE;
}
