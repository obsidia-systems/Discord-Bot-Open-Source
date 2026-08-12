import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { initDatabase, getDb } from "./client.js";

/**
 * Aplica migraciones SQL de `backend/drizzle`.
 *
 * Nota: `initDatabase()` puede haber creado tablas con IF NOT EXISTS (bootstrap).
 * Por eso las migraciones también usan IF NOT EXISTS, para no fallar en DBs ya
 * inicializadas que aún no tienen registro en `__drizzle_migrations`.
 */
function run(): void {
  initDatabase();
  const db = getDb();

  const here = path.dirname(fileURLToPath(import.meta.url));
  // En runtime: dist/db → ../drizzle ; en tsx: src/db → ../drizzle
  const migrationsFolder = path.resolve(here, "../../drizzle");

  migrate(db, { migrationsFolder });
  console.log(`[adobos] Migraciones Drizzle aplicadas desde ${migrationsFolder}`);
}

run();
