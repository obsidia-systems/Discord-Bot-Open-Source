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

    CREATE TABLE IF NOT EXISTS reaction_roles (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      emoji_key TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, emoji_key),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS welcome_settings (
      guild_id TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      background_url TEXT,
      bg_filepath TEXT,
      blur_amount INTEGER NOT NULL DEFAULT 4,
      primary_text TEXT NOT NULL DEFAULT '¡Bienvenido!',
      secondary_text TEXT NOT NULL DEFAULT '{username}',
      message_content TEXT NOT NULL DEFAULT '{user}',
      avatar_x INTEGER NOT NULL DEFAULT 960,
      avatar_y INTEGER NOT NULL DEFAULT 380,
      avatar_size INTEGER NOT NULL DEFAULT 280,
      text_x INTEGER NOT NULL DEFAULT 960,
      text_y INTEGER NOT NULL DEFAULT 560,
      font_size INTEGER NOT NULL DEFAULT 64,
      text_color TEXT NOT NULL DEFAULT '#FFFFFF',
      updated_at INTEGER NOT NULL,
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

  // Migración suave: welcome_settings antigua (embed_data) → tarjeta
  const welcomeColumns = database
    .prepare(`PRAGMA table_info(welcome_settings)`)
    .all() as Array<{ name: string }>;
  const welcomeColNames = new Set(welcomeColumns.map((column) => column.name));
  if (welcomeColNames.has("embed_data") && !welcomeColNames.has("background_url")) {
    database.exec(`
      PRAGMA foreign_keys=OFF;
      CREATE TABLE IF NOT EXISTS __welcome_settings_new (
        guild_id TEXT PRIMARY KEY NOT NULL,
        channel_id TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 0,
        background_url TEXT,
        blur_amount INTEGER NOT NULL DEFAULT 4,
        primary_text TEXT NOT NULL DEFAULT '¡Bienvenido!',
        secondary_text TEXT NOT NULL DEFAULT '{username}',
        message_content TEXT NOT NULL DEFAULT '{user}',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO __welcome_settings_new (
        guild_id, channel_id, is_enabled, background_url, blur_amount,
        primary_text, secondary_text, message_content, updated_at
      )
      SELECT
        guild_id, channel_id, is_enabled, NULL, 4,
        '¡Bienvenido!', '{username}', '{user}', updated_at
      FROM welcome_settings;
      DROP TABLE welcome_settings;
      ALTER TABLE __welcome_settings_new RENAME TO welcome_settings;
      PRAGMA foreign_keys=ON;
    `);
  } else if (welcomeColumns.length > 0) {
    const addColumn = (name: string, ddl: string): void => {
      if (!welcomeColNames.has(name)) {
        database.exec(`ALTER TABLE welcome_settings ADD COLUMN ${ddl}`);
      }
    };
    addColumn("background_url", "background_url TEXT");
    addColumn("blur_amount", "blur_amount INTEGER NOT NULL DEFAULT 4");
    addColumn("primary_text", "primary_text TEXT NOT NULL DEFAULT '¡Bienvenido!'");
    addColumn("secondary_text", "secondary_text TEXT NOT NULL DEFAULT '{username}'");
    addColumn("message_content", "message_content TEXT NOT NULL DEFAULT '{user}'");
    addColumn("bg_filepath", "bg_filepath TEXT");
    addColumn("avatar_x", "avatar_x INTEGER NOT NULL DEFAULT 960");
    addColumn("avatar_y", "avatar_y INTEGER NOT NULL DEFAULT 380");
    addColumn("avatar_size", "avatar_size INTEGER NOT NULL DEFAULT 280");
    addColumn("text_x", "text_x INTEGER NOT NULL DEFAULT 960");
    addColumn("text_y", "text_y INTEGER NOT NULL DEFAULT 560");
    addColumn("font_size", "font_size INTEGER NOT NULL DEFAULT 64");
    addColumn("text_color", "text_color TEXT NOT NULL DEFAULT '#FFFFFF'");
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
