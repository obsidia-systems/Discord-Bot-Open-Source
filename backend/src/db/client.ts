import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { logger } from "#core/log.js";
import { runtimeRole } from "#core/runtime/index.js";
import * as schema from "./schema.js";

/**
 * Tamaño de pool por rol. Con N réplicas del rol `api` cada una abre su pool
 * contra el mismo Postgres, así que el `api` es más pequeño por réplica.
 * `DB_POOL_MAX` lo sobreescribe.
 */
function poolMax(): number {
  const override = Number(process.env.DB_POOL_MAX);
  if (Number.isInteger(override) && override > 0) return override;
  switch (runtimeRole()) {
    case "api":
      return 8;
    case "gateway":
    case "worker":
      return 6;
    default:
      return 12;
  }
}

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let db: AppDatabase | null = null;
let sql: ReturnType<typeof postgres> | null = null;

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw || raw.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must be postgresql://… (Phase 2.11). SQLite is no longer supported.",
    );
  }
  return raw;
}

function migrationsFolder(): string {
  return path.resolve(import.meta.dirname, "../../drizzle");
}

/** Conecta a Postgres, aplica migraciones Drizzle y deja el pool listo. */
export async function initDatabase(): Promise<AppDatabase> {
  if (db) return db;

  const url = resolveDatabaseUrl();
  const folder = migrationsFolder();

  for (let attempt = 1; attempt <= 8; attempt++) {
    const migrationClient = postgres(url, { max: 1, connect_timeout: 10 });
    try {
      await migrate(
        drizzle(migrationClient, { schema, casing: "snake_case" }),
        {
          migrationsFolder: folder,
        },
      );
      await migrationClient.end({ timeout: 5 });

      const max = poolMax();
      sql = postgres(url, {
        max,
        idle_timeout: 20,
        max_lifetime: 60 * 30,
        connection: {
          // Una query que se descontrola muere sola (ms) en vez de retener
          // una conexión del pool indefinidamente.
          statement_timeout: 15_000,
          idle_in_transaction_session_timeout: 30_000,
          application_name: `adobos-${runtimeRole()}`,
        },
      });
      db = drizzle(sql, { schema, casing: "snake_case" });
      logger.info({ poolMax: max, role: runtimeRole() }, "Postgres listo");
      return db;
    } catch (error: unknown) {
      await migrationClient.end({ timeout: 5 }).catch(() => undefined);
      const code = errorCode(error);
      const retryable =
        code === "EAI_AGAIN" ||
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "ETIMEDOUT" ||
        code === "CONNECT_TIMEOUT";
      if (!retryable || attempt === 8) throw error;
      const delay = Math.min(500 * 2 ** (attempt - 1), 5000);
      logger.warn(
        { err: error, code },
        `Postgres no alcanzable; reintento ${attempt}/8 en ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Could not connect to Postgres.");
}

/**
 * Código de error de red, desenvolviendo la cadena `cause`.
 * drizzle-orm ≥0.39 envuelve los fallos en `DrizzleQueryError`, así que el
 * `ECONNREFUSED`/`ENOTFOUND` real vive en `error.cause` (o más abajo).
 */
function errorCode(error: unknown): string {
  let cursor: unknown = error;
  for (
    let depth = 0;
    cursor && typeof cursor === "object" && depth < 5;
    depth++
  ) {
    const code = (cursor as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return "";
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export async function pingDatabase(): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
  sql = null;
  db = null;
}

export async function one<T>(rows: Promise<T[]>): Promise<T | undefined> {
  const [row] = await rows;
  return row;
}
