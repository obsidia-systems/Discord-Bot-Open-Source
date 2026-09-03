/**
 * Ciclo de vida del proceso: guards de errores no capturados + drain ordenado.
 *
 * - `installProcessGuards()` una vez al arrancar: engancha unhandledRejection,
 *   uncaughtException y SIGINT/SIGTERM.
 * - `onShutdown(name, fn)` registra trabajo de cierre. Se ejecuta en orden LIFO
 *   (lo último que se levantó es lo primero que se baja).
 * - `registerJob(name, timer, drain?)` para `setInterval` de larga vida: hace
 *   `unref()` y al apagar hace `clearInterval` + `drain()` opcional.
 */

import { logger } from "./log.js";

type ShutdownFn = () => Promise<void> | void;

interface Hook {
  name: string;
  fn: ShutdownFn;
}

const hooks: Hook[] = [];
const HOOK_TIMEOUT_MS = 10_000;

let guardsInstalled = false;
let shuttingDown = false;

/** Registra trabajo de cierre. Orden de ejecución: LIFO. */
export function onShutdown(name: string, fn: ShutdownFn): void {
  hooks.push({ name, fn });
}

/**
 * Enrola un `setInterval` de larga vida en el ciclo de vida:
 * `unref()` para no bloquear la salida y `clearInterval` (+ `drain` opcional
 * para esperar un tick en vuelo) al apagar.
 */
export function registerJob(
  name: string,
  timer: ReturnType<typeof setInterval>,
  drain?: () => Promise<void> | void,
): void {
  timer.unref?.();
  onShutdown(`job:${name}`, async () => {
    clearInterval(timer);
    if (drain) await drain();
  });
}

/** Ejecuta los hooks en orden inverso y termina el proceso. Idempotente. */
export async function runShutdown(signal: string, code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown: iniciando drain");

  for (const hook of [...hooks].reverse()) {
    try {
      await Promise.race([
        Promise.resolve(hook.fn()),
        new Promise<void>((resolve) => {
          setTimeout(resolve, HOOK_TIMEOUT_MS).unref();
        }),
      ]);
      logger.info({ hook: hook.name }, "shutdown: hook ok");
    } catch (err) {
      logger.error({ err, hook: hook.name }, "shutdown: hook falló");
    }
  }

  logger.info("shutdown: completo");
  process.exit(code);
}

/** Engancha los handlers globales del proceso. Llamar una sola vez al boot. */
export function installProcessGuards(): void {
  if (guardsInstalled) return;
  guardsInstalled = true;

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandledRejection (sin crash)");
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException — cerrando");
    void runShutdown("uncaughtException", 1);
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      void runShutdown(sig);
    });
  }
}
