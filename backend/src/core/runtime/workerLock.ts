import postgres from "postgres";
import { logger } from "../log.js";

let lockSql: ReturnType<typeof postgres> | null = null;

const LOCK_KEY = "adobos-worker";

/**
 * Lock de sesión Postgres. Usa una conexión dedicada (no el pool) para que
 * no se suelte al devolver el cliente. Evita doble-envío de crons.
 */
export async function acquireWorkerLock(databaseUrl: string): Promise<boolean> {
  if (lockSql) return true;
  const client = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 0,
    max_lifetime: 0,
  });
  try {
    const rows = await client<{ ok: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtext(${LOCK_KEY})) AS ok
    `;
    const ok = Boolean(rows[0]?.ok);
    if (!ok) {
      await client.end({ timeout: 2 });
      logger.warn(
        "Otro proceso ya tiene el lock de worker; este no arrancará crons",
      );
      return false;
    }
    lockSql = client;
    logger.info("Lock de worker adquirido");
    return true;
  } catch (error: unknown) {
    await client.end({ timeout: 2 }).catch(() => undefined);
    logger.error({ err: error }, "No se pudo adquirir el lock de worker");
    return false;
  }
}

export async function releaseWorkerLock(): Promise<void> {
  if (!lockSql) return;
  try {
    await lockSql`SELECT pg_advisory_unlock(hashtext(${LOCK_KEY}))`;
  } catch {
    // el end() suelta el lock de sesión de todos modos
  }
  await lockSql.end({ timeout: 5 }).catch(() => undefined);
  lockSql = null;
}
