import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let db: AppDatabase | null = null;
let sqlite: Database.Database | null = null;

function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? "file:./data/database.sqlite";
  return raw.startsWith("file:") ? raw.slice("file:".length) : raw;
}

/** Bootstrap / migrate-lite: asegura tablas del núcleo aunque no se haya corrido drizzle-kit. */
function ensureCoreTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY NOT NULL,
      prefix TEXT NOT NULL DEFAULT '!',
      log_channel_id TEXT,
      welcome_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugins_enabled (
      guild_id TEXT NOT NULL,
      plugin_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, plugin_name),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );
  `);

  // Migración suave si la DB ya existía sin log_channel_id
  const columns = database
    .prepare(`PRAGMA table_info(guild_settings)`)
    .all() as Array<{ name: string }>;
  const hasLogChannel = columns.some((column) => column.name === "log_channel_id");
  if (!hasLogChannel) {
    database.exec(`ALTER TABLE guild_settings ADD COLUMN log_channel_id TEXT`);
  }
}

export function initDatabase(): AppDatabase {
  if (db) return db;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureCoreTables(sqlite);

  db = drizzle(sqlite, { schema });
  console.log(`[adobos] SQLite listo en ${dbPath}`);
  return db;
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error("Base de datos no inicializada. Llama a initDatabase() primero.");
  }
  return db;
}

export function getSqlite(): Database.Database {
  if (!sqlite) {
    throw new Error("SQLite no inicializado.");
  }
  return sqlite;
}
