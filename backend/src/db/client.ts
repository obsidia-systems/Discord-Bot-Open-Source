import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { logger } from "#core/log.js";
import * as schema from "./schema.js";

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
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../drizzle");
}

/** Conecta a Postgres, aplica migraciones Drizzle y deja el pool listo. */
export async function initDatabase(): Promise<AppDatabase> {
  if (db) return db;

  const url = resolveDatabaseUrl();
  const folder = migrationsFolder();

  for (let attempt = 1; attempt <= 8; attempt++) {
    const migrationClient = postgres(url, { max: 1, connect_timeout: 10 });
    try {
      await migrate(drizzle(migrationClient, { schema }), {
        migrationsFolder: folder,
      });
      await migrationClient.end({ timeout: 5 });

      sql = postgres(url, { max: 10, idle_timeout: 20, max_lifetime: 60 * 30 });
      db = drizzle(sql, { schema });
      logger.info("Postgres listo");
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

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
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
