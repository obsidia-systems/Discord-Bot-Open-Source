import "dotenv/config";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { initDatabase, getDb } from "./client.js";

/**
 * Aplica migraciones SQL de `backend/drizzle`.
 * El bootstrap de `initDatabase()` también crea tablas si faltan (dev-friendly).
 */
function run(): void {
  initDatabase();
  const db = getDb();
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[adobos] Migraciones Drizzle aplicadas.");
}

run();
