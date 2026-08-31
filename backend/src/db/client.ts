import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema.js";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let db: AppDatabase | null = null;
let sql: ReturnType<typeof postgres> | null = null;

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw || raw.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL debe ser postgresql://… (Fase 2.11). SQLite ya no es compatible.",
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
  const migrationClient = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(migrationClient, { schema }), {
      migrationsFolder: migrationsFolder(),
    });
  } finally {
    await migrationClient.end({ timeout: 5 });
  }

  sql = postgres(url, { max: 10, idle_timeout: 20, max_lifetime: 60 * 30 });
  db = drizzle(sql, { schema });
  console.log("[adobos] Postgres listo");
  return db;
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error("Base de datos no inicializada. Llama a initDatabase() primero.");
  }
  return db;
}

export async function one<T>(rows: Promise<T[]>): Promise<T | undefined> {
  const [row] = await rows;
  return row;
}
