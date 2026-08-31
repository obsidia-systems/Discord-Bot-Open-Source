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

    CREATE TABLE IF NOT EXISTS auto_roles (
      guild_id TEXT PRIMARY KEY NOT NULL,
      human_roles TEXT NOT NULL DEFAULT '[]',
      bot_roles TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reaction_roles_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'reactions',
      roles_mapping TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS autoroles_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Autoroles',
      type TEXT NOT NULL DEFAULT 'BUTTONS',
      roles_mapping TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS welcome_settings (
      guild_id TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      welcome_mode TEXT NOT NULL DEFAULT 'card',
      background_url TEXT,
      bg_filepath TEXT,
      blur_amount INTEGER NOT NULL DEFAULT 4,
      primary_text TEXT NOT NULL DEFAULT '¡Bienvenido!',
      secondary_text TEXT NOT NULL DEFAULT '{username}',
      message_content TEXT NOT NULL DEFAULT '{user}',
      avatar_x INTEGER NOT NULL DEFAULT 960,
      avatar_y INTEGER NOT NULL DEFAULT 380,
      avatar_size INTEGER NOT NULL DEFAULT 280,
      avatar_border_width INTEGER NOT NULL DEFAULT 8,
      avatar_border_color TEXT NOT NULL DEFAULT '#FFFFFF',
      text_x INTEGER NOT NULL DEFAULT 960,
      text_y INTEGER NOT NULL DEFAULT 560,
      font_size INTEGER NOT NULL DEFAULT 64,
      text_color TEXT NOT NULL DEFAULT '#FFFFFF',
      text_layers TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS canvas_event_settings (
      guild_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      channel_id TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      background_url TEXT,
      bg_filepath TEXT,
      blur_amount INTEGER NOT NULL DEFAULT 4,
      primary_text TEXT NOT NULL DEFAULT '¡Hasta pronto!',
      secondary_text TEXT NOT NULL DEFAULT '{username}',
      message_content TEXT NOT NULL DEFAULT '{user}',
      avatar_x INTEGER NOT NULL DEFAULT 960,
      avatar_y INTEGER NOT NULL DEFAULT 380,
      avatar_size INTEGER NOT NULL DEFAULT 280,
      avatar_border_width INTEGER NOT NULL DEFAULT 8,
      avatar_border_color TEXT NOT NULL DEFAULT '#FFFFFF',
      text_x INTEGER NOT NULL DEFAULT 960,
      text_y INTEGER NOT NULL DEFAULT 560,
      font_size INTEGER NOT NULL DEFAULT 64,
      text_color TEXT NOT NULL DEFAULT '#FFFFFF',
      text_layers TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, event_type),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embed_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      embed_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sent_embeds (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      title TEXT,
      embed_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mod_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      target_channel_id TEXT,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      meta TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS action_logs_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      routing_mode TEXT NOT NULL DEFAULT 'GLOBAL',
      global_channel_id TEXT,
      channels_mapping TEXT NOT NULL DEFAULT '{}',
      ignored_channels TEXT NOT NULL DEFAULT '[]',
      ignored_roles TEXT NOT NULL DEFAULT '[]',
      ignore_bots INTEGER NOT NULL DEFAULT 1,
      enabled_events TEXT NOT NULL DEFAULT '{}',
      data_retention_days INTEGER NOT NULL DEFAULT 14,
      webhooks_mapping TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS action_logs (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      executor_id TEXT,
      executor_tag TEXT,
      target_id TEXT,
      target_tag TEXT,
      channel_id TEXT,
      summary TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auto_mod_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      filters TEXT NOT NULL DEFAULT '{}',
      ignored_roles TEXT NOT NULL DEFAULT '[]',
      ignored_channels TEXT NOT NULL DEFAULT '[]',
      log_channel_id TEXT,
      warn_decay_days INTEGER NOT NULL DEFAULT 30,
      punishments TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auto_delete_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      rules TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS interactive_forms (
      guild_id TEXT PRIMARY KEY NOT NULL,
      modal_title TEXT NOT NULL DEFAULT 'Formulario',
      button_label TEXT NOT NULL DEFAULT 'Abrir formulario',
      embed_title TEXT NOT NULL DEFAULT 'Formulario del servidor',
      embed_description TEXT NOT NULL DEFAULT 'Haz clic en el botón para completar el formulario.',
      embed_color TEXT NOT NULL DEFAULT '#5865F2',
      publish_channel_id TEXT,
      reception_channel_id TEXT,
      questions TEXT NOT NULL DEFAULT '[]',
      published_channel_id TEXT,
      published_message_id TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guild_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      modal_title TEXT NOT NULL DEFAULT 'Formulario',
      button_label TEXT NOT NULL DEFAULT 'Abrir formulario',
      embed_title TEXT NOT NULL DEFAULT 'Formulario del servidor',
      embed_description TEXT NOT NULL DEFAULT 'Haz clic en el botón para completar el formulario.',
      embed_color TEXT NOT NULL DEFAULT '#5865F2',
      embed_image_url TEXT,
      embed_thumbnail_url TEXT,
      publish_channel_id TEXT,
      reception_channel_id TEXT,
      questions TEXT NOT NULL DEFAULT '[]',
      cooldown_minutes INTEGER NOT NULL DEFAULT 0,
      published_channel_id TEXT,
      published_message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS form_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      form_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      answers TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (form_id) REFERENCES guild_forms(id) ON DELETE CASCADE,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      frequency TEXT NOT NULL DEFAULT '{}',
      embed_data TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS custom_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT 'Comando personalizado',
      response_data TEXT NOT NULL DEFAULT '{}',
      options TEXT NOT NULL DEFAULT '{}',
      permissions TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS default_command_permissions (
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      allowed_roles TEXT NOT NULL DEFAULT '[]',
      ignored_channels TEXT NOT NULL DEFAULT '[]',
      ephemeral INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, command_name),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS xp_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      text_xp_min INTEGER NOT NULL DEFAULT 15,
      text_xp_max INTEGER NOT NULL DEFAULT 25,
      cooldown_seconds INTEGER NOT NULL DEFAULT 60,
      voice_enabled INTEGER NOT NULL DEFAULT 0,
      voice_xp_per_minute INTEGER NOT NULL DEFAULT 10,
      stream_multiplier REAL NOT NULL DEFAULT 1,
      xp_multiplier INTEGER NOT NULL DEFAULT 1,
      ignored_roles TEXT NOT NULL DEFAULT '[]',
      ignored_channels TEXT NOT NULL DEFAULT '[]',
      level_up_channel_id TEXT,
      custom_multipliers TEXT NOT NULL DEFAULT '[]',
      custom_channel_multipliers TEXT NOT NULL DEFAULT '[]',
      level_up_format TEXT NOT NULL DEFAULT 'EMBED',
      level_up_message TEXT NOT NULL DEFAULT '¡Felicidades {user}! Has alcanzado el **Nivel {level}**.',
      level_up_embed_title TEXT NOT NULL DEFAULT '¡Subida de Nivel!',
      level_up_embed_color TEXT NOT NULL DEFAULT '#34E21D',
      level_up_show_thumbnail INTEGER NOT NULL DEFAULT 1,
      level_up_image TEXT,
      live_leaderboard_channel_id TEXT,
      live_leaderboard_message_id TEXT,
      leaderboard_embed_title TEXT NOT NULL DEFAULT '🏆 Tabla de Clasificación',
      leaderboard_embed_description TEXT NOT NULL DEFAULT '',
      leaderboard_embed_color TEXT NOT NULL DEFAULT '#CA7AFF',
      leaderboard_show_thumbnail INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS xp_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_xp (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      xp_frozen_until INTEGER,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bot_presence_settings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'online',
      activity_type TEXT NOT NULL DEFAULT 'Playing',
      activity_name TEXT NOT NULL DEFAULT '',
      stream_url TEXT,
      state TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
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
    addColumn("welcome_mode", "welcome_mode TEXT NOT NULL DEFAULT 'card'");
  }

  // Por si la tabla ya existía sin welcome_mode
  const welcomeColsAfter = database
    .prepare(`PRAGMA table_info(welcome_settings)`)
    .all() as Array<{ name: string }>;
  if (
    welcomeColsAfter.length > 0 &&
    !welcomeColsAfter.some((column) => column.name === "welcome_mode")
  ) {
    database.exec(
      `ALTER TABLE welcome_settings ADD COLUMN welcome_mode TEXT NOT NULL DEFAULT 'card'`,
    );
  }

  const welcomeColsFinal = database
    .prepare(`PRAGMA table_info(welcome_settings)`)
    .all() as Array<{ name: string }>;
  const welcomeFinalNames = new Set(welcomeColsFinal.map((c) => c.name));
  if (welcomeColsFinal.length > 0) {
    if (!welcomeFinalNames.has("avatar_border_width")) {
      database.exec(
        `ALTER TABLE welcome_settings ADD COLUMN avatar_border_width INTEGER NOT NULL DEFAULT 8`,
      );
    }
    if (!welcomeFinalNames.has("avatar_border_color")) {
      database.exec(
        `ALTER TABLE welcome_settings ADD COLUMN avatar_border_color TEXT NOT NULL DEFAULT '#FFFFFF'`,
      );
    }
    if (!welcomeFinalNames.has("text_layers")) {
      database.exec(`ALTER TABLE welcome_settings ADD COLUMN text_layers TEXT`);
    }
  }

  // Migración suave: quitar details de bot_presence_settings
  const presenceColumns = database
    .prepare(`PRAGMA table_info(bot_presence_settings)`)
    .all() as Array<{ name: string }>;
  if (presenceColumns.some((column) => column.name === "details")) {
    database.exec(`ALTER TABLE bot_presence_settings DROP COLUMN details`);
  }

  // Migración suave: columnas nuevas de action_logs_config
  const actionLogsConfigCols = database
    .prepare(`PRAGMA table_info(action_logs_config)`)
    .all() as Array<{ name: string }>;
  if (actionLogsConfigCols.length > 0) {
    const names = new Set(actionLogsConfigCols.map((c) => c.name));
    if (!names.has("data_retention_days")) {
      database.exec(
        `ALTER TABLE action_logs_config ADD COLUMN data_retention_days INTEGER NOT NULL DEFAULT 14`,
      );
    }
    if (!names.has("webhooks_mapping")) {
      database.exec(
        `ALTER TABLE action_logs_config ADD COLUMN webhooks_mapping TEXT NOT NULL DEFAULT '{}'`,
      );
    }
  }

  // Migración suave: warn_decay_days + punishments en auto_mod_config
  const autoModCols = database
    .prepare(`PRAGMA table_info(auto_mod_config)`)
    .all() as Array<{ name: string }>;
  if (autoModCols.length > 0) {
    const names = new Set(autoModCols.map((c) => c.name));
    if (!names.has("warn_decay_days")) {
      database.exec(
        `ALTER TABLE auto_mod_config ADD COLUMN warn_decay_days INTEGER NOT NULL DEFAULT 30`,
      );
    }
    if (!names.has("punishments")) {
      database.exec(
        `ALTER TABLE auto_mod_config ADD COLUMN punishments TEXT NOT NULL DEFAULT '[]'`,
      );
    }
  }

  // Migración suave: xp_frozen_until en user_xp
  const userXpCols = database
    .prepare(`PRAGMA table_info(user_xp)`)
    .all() as Array<{ name: string }>;
  if (
    userXpCols.length > 0 &&
    !userXpCols.some((column) => column.name === "xp_frozen_until")
  ) {
    database.exec(`ALTER TABLE user_xp ADD COLUMN xp_frozen_until INTEGER`);
  }

  // Migración suave: leaderboard en vivo + anuncios premium en xp_config
  const xpConfigCols = database
    .prepare(`PRAGMA table_info(xp_config)`)
    .all() as Array<{ name: string }>;
  if (xpConfigCols.length > 0) {
    const names = new Set(xpConfigCols.map((c) => c.name));
    if (!names.has("live_leaderboard_channel_id")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN live_leaderboard_channel_id TEXT`,
      );
    }
    if (!names.has("live_leaderboard_message_id")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN live_leaderboard_message_id TEXT`,
      );
    }
    if (!names.has("custom_multipliers")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN custom_multipliers TEXT NOT NULL DEFAULT '[]'`,
      );
    }
    if (!names.has("level_up_format")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN level_up_format TEXT NOT NULL DEFAULT 'TEXT'`,
      );
    }
    if (!names.has("level_up_message")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN level_up_message TEXT NOT NULL DEFAULT '🎉 {user} subió al **nivel {level}**!'`,
      );
    }
    if (!names.has("level_up_image")) {
      database.exec(`ALTER TABLE xp_config ADD COLUMN level_up_image TEXT`);
    }
    if (!names.has("level_up_embed_title")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN level_up_embed_title TEXT NOT NULL DEFAULT '¡Subida de Nivel!'`,
      );
    }
    if (!names.has("level_up_embed_color")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN level_up_embed_color TEXT NOT NULL DEFAULT '#34E21D'`,
      );
    }
    if (!names.has("level_up_show_thumbnail")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN level_up_show_thumbnail INTEGER NOT NULL DEFAULT 1`,
      );
    }
    if (!names.has("leaderboard_embed_title")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN leaderboard_embed_title TEXT NOT NULL DEFAULT '🏆 Tabla de Clasificación'`,
      );
    }
    if (!names.has("leaderboard_embed_description")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN leaderboard_embed_description TEXT NOT NULL DEFAULT ''`,
      );
    }
    if (!names.has("leaderboard_embed_color")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN leaderboard_embed_color TEXT NOT NULL DEFAULT '#CA7AFF'`,
      );
    }
    if (!names.has("leaderboard_show_thumbnail")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN leaderboard_show_thumbnail INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!names.has("stream_multiplier")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN stream_multiplier REAL NOT NULL DEFAULT 1`,
      );
    }
    if (!names.has("custom_channel_multipliers")) {
      database.exec(
        `ALTER TABLE xp_config ADD COLUMN custom_channel_multipliers TEXT NOT NULL DEFAULT '[]'`,
      );
    }
  }

  // Migración suave: timezone por mensaje programado
  const scheduledCols = database
    .prepare(`PRAGMA table_info(scheduled_messages)`)
    .all() as Array<{ name: string }>;
  if (scheduledCols.length > 0) {
    const scheduledNames = new Set(scheduledCols.map((c) => c.name));
    if (!scheduledNames.has("timezone")) {
      database.exec(
        `ALTER TABLE scheduled_messages ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'`,
      );
    }
  }

  // Migración suave: interactive_forms (1:1) → guild_forms (N)
  try {
    const guildFormsCount = (
      database.prepare(`SELECT COUNT(*) AS c FROM guild_forms`).get() as {
        c: number;
      }
    ).c;
    if (guildFormsCount === 0) {
      const legacy = database
        .prepare(`SELECT * FROM interactive_forms`)
        .all() as Array<Record<string, unknown>>;
      const now = Date.now();
      const insert = database.prepare(`
        INSERT INTO guild_forms (
          guild_id, modal_title, button_label, embed_title, embed_description,
          embed_color, publish_channel_id, reception_channel_id, questions,
          cooldown_minutes, published_channel_id, published_message_id,
          created_at, updated_at
        ) VALUES (
          @guild_id, @modal_title, @button_label, @embed_title, @embed_description,
          @embed_color, @publish_channel_id, @reception_channel_id, @questions,
          0, @published_channel_id, @published_message_id,
          @created_at, @updated_at
        )
      `);
      for (const row of legacy) {
        insert.run({
          guild_id: row.guild_id,
          modal_title: row.modal_title ?? "Formulario",
          button_label: row.button_label ?? "Abrir formulario",
          embed_title: row.embed_title ?? "Formulario del servidor",
          embed_description:
            row.embed_description ??
            "Haz clic en el botón para completar el formulario.",
          embed_color: row.embed_color ?? "#5865F2",
          publish_channel_id: row.publish_channel_id ?? null,
          reception_channel_id: row.reception_channel_id ?? null,
          questions: row.questions ?? "[]",
          published_channel_id: row.published_channel_id ?? null,
          published_message_id: row.published_message_id ?? null,
          created_at: Number(row.updated_at) || now,
          updated_at: Number(row.updated_at) || now,
        });
      }
    }
  } catch {
    /* tablas aún no listas */
  }

  try {
    const dcpCols = database
      .prepare(`PRAGMA table_info(default_command_permissions)`)
      .all() as Array<{ name: string }>;
    const dcpNames = new Set(dcpCols.map((c) => c.name));
    if (dcpNames.size > 0 && !dcpNames.has("ignored_channels")) {
      database.exec(
        `ALTER TABLE default_command_permissions ADD COLUMN ignored_channels TEXT NOT NULL DEFAULT '[]'`,
      );
    }
  } catch {
    /* tabla aún no lista */
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS economy_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      currency_name TEXT NOT NULL DEFAULT 'Adobos Coins',
      currency_symbol TEXT NOT NULL DEFAULT '🪙',
      start_balance INTEGER NOT NULL DEFAULT 0,
      transfer_tax INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_economy (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      wallet INTEGER NOT NULL DEFAULT 0,
      bank INTEGER NOT NULL DEFAULT 0,
      daily_streak INTEGER NOT NULL DEFAULT 0,
      last_daily_at INTEGER,
      last_weekly_at INTEGER,
      last_monthly_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_cooldowns (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command_key TEXT NOT NULL,
      available_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, command_key),
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_income (
      guild_id TEXT PRIMARY KEY NOT NULL,
      daily_pay INTEGER NOT NULL DEFAULT 100,
      weekly_pay INTEGER NOT NULL DEFAULT 500,
      monthly_pay INTEGER NOT NULL DEFAULT 2000,
      streak_enabled INTEGER NOT NULL DEFAULT 0,
      streak_bonus_percent INTEGER NOT NULL DEFAULT 5,
      role_salaries TEXT NOT NULL DEFAULT '[]',
      jobs TEXT NOT NULL DEFAULT '[]',
      crimes TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_shop_items (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT '🛒',
      stock INTEGER,
      rewards TEXT NOT NULL DEFAULT '{}',
      action_sequence TEXT DEFAULT '[]',
      reward_type TEXT,
      reward_config TEXT DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_purchases (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      price_paid INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'fulfilled',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_user_boosts (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      multiplier INTEGER NOT NULL,
      expires_at INTEGER,
      purchase_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_owned_roles (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      item_id TEXT,
      purchase_id TEXT,
      expires_at INTEGER,
      delete_role_on_expire INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_owned_channels (
      id TEXT PRIMARY KEY NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      item_id TEXT,
      purchase_id TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS economy_casino (
      guild_id TEXT PRIMARY KEY NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      min_bet INTEGER NOT NULL DEFAULT 10,
      max_bet INTEGER NOT NULL DEFAULT 10000,
      coinflip TEXT NOT NULL DEFAULT '{}',
      roulette TEXT NOT NULL DEFAULT '{}',
      blackjack TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plugin_pokemon_config (
      guild_id TEXT PRIMARY KEY NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      default_generation INTEGER NOT NULL DEFAULT 9,
      language TEXT NOT NULL DEFAULT 'es',
      embed_color TEXT NOT NULL DEFAULT '#EF4444',
      force_ephemeral INTEGER NOT NULL DEFAULT 1,
      allowed_channels TEXT NOT NULL DEFAULT '[]',
      allowed_roles TEXT NOT NULL DEFAULT '[]',
      commands TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
    );
  `);

  try {
    const pokeCols = database
      .prepare(`PRAGMA table_info(plugin_pokemon_config)`)
      .all() as Array<{ name: string }>;
    if (
      pokeCols.length > 0 &&
      !pokeCols.some((c) => c.name === "allowed_roles")
    ) {
      database.exec(
        `ALTER TABLE plugin_pokemon_config ADD COLUMN allowed_roles TEXT NOT NULL DEFAULT '[]'`,
      );
    }
  } catch (error) {
    console.warn(
      "[adobos] migrate plugin_pokemon_config.allowed_roles:",
      error,
    );
  }

  try {
    let shopCols = database
      .prepare(`PRAGMA table_info(economy_shop_items)`)
      .all() as Array<{ name: string; notnull: number }>;
    if (
      shopCols.length > 0 &&
      !shopCols.some((c) => c.name === "action_sequence")
    ) {
      database.exec(
        `ALTER TABLE economy_shop_items ADD COLUMN action_sequence TEXT DEFAULT '[]'`,
      );
    }
    if (shopCols.length > 0 && !shopCols.some((c) => c.name === "rewards")) {
      database.exec(
        `ALTER TABLE economy_shop_items ADD COLUMN rewards TEXT NOT NULL DEFAULT '{}'`,
      );
    }

    // Legacy 0037: reward_type era NOT NULL; Smart Toggles inserta NULL.
    shopCols = database
      .prepare(`PRAGMA table_info(economy_shop_items)`)
      .all() as Array<{ name: string; notnull: number }>;
    const rewardTypeCol = shopCols.find((c) => c.name === "reward_type");
    if (rewardTypeCol?.notnull === 1) {
      database.exec(`
        PRAGMA foreign_keys=OFF;
        DROP TABLE IF EXISTS __economy_shop_items_new;
        CREATE TABLE __economy_shop_items_new (
          id TEXT PRIMARY KEY NOT NULL,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          price INTEGER NOT NULL DEFAULT 0,
          icon TEXT NOT NULL DEFAULT '🛒',
          stock INTEGER,
          rewards TEXT NOT NULL DEFAULT '{}',
          action_sequence TEXT DEFAULT '[]',
          reward_type TEXT,
          reward_config TEXT DEFAULT '{}',
          enabled INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
        );
        INSERT OR IGNORE INTO __economy_shop_items_new (
          id, guild_id, name, description, price, icon, stock,
          rewards, action_sequence, reward_type, reward_config,
          enabled, sort_order, created_at, updated_at
        )
        SELECT
          id, guild_id, name, description, price, icon, stock,
          COALESCE(rewards, '{}'),
          COALESCE(action_sequence, '[]'),
          reward_type,
          COALESCE(reward_config, '{}'),
          enabled, sort_order, created_at, updated_at
        FROM economy_shop_items;
        DROP TABLE economy_shop_items;
        ALTER TABLE __economy_shop_items_new RENAME TO economy_shop_items;
        CREATE INDEX IF NOT EXISTS economy_shop_items_guild_idx
          ON economy_shop_items (guild_id);
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch {
    /* ignore */
  }

  try {
    const ownedCols = database
      .prepare(`PRAGMA table_info(economy_owned_roles)`)
      .all() as Array<{ name: string }>;
    if (
      ownedCols.length > 0 &&
      !ownedCols.some((c) => c.name === "expires_at")
    ) {
      database.exec(
        `ALTER TABLE economy_owned_roles ADD COLUMN expires_at INTEGER`,
      );
    }
    if (
      ownedCols.length > 0 &&
      !ownedCols.some((c) => c.name === "delete_role_on_expire")
    ) {
      database.exec(
        `ALTER TABLE economy_owned_roles ADD COLUMN delete_role_on_expire INTEGER NOT NULL DEFAULT 0`,
      );
    }
  } catch {
    /* ignore */
  }

  // Boosts permanentes: expires_at nullable (legacy era NOT NULL).
  try {
    const boostCols = database
      .prepare(`PRAGMA table_info(economy_user_boosts)`)
      .all() as Array<{ name: string; notnull: number }>;
    const expiresCol = boostCols.find((c) => c.name === "expires_at");
    if (expiresCol?.notnull === 1) {
      database.exec(`
        PRAGMA foreign_keys=OFF;
        DROP TABLE IF EXISTS __economy_user_boosts_new;
        CREATE TABLE __economy_user_boosts_new (
          id TEXT PRIMARY KEY NOT NULL,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          module TEXT NOT NULL,
          multiplier INTEGER NOT NULL,
          expires_at INTEGER,
          purchase_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
        );
        INSERT OR IGNORE INTO __economy_user_boosts_new (
          id, guild_id, user_id, module, multiplier, expires_at, purchase_id, created_at
        )
        SELECT id, guild_id, user_id, module, multiplier, expires_at, purchase_id, created_at
        FROM economy_user_boosts;
        DROP TABLE economy_user_boosts;
        ALTER TABLE __economy_user_boosts_new RENAME TO economy_user_boosts;
        CREATE INDEX IF NOT EXISTS economy_user_boosts_lookup_idx
          ON economy_user_boosts (guild_id, user_id, module);
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch {
    /* ignore */
  }

  try {
    const userEcoCols = database
      .prepare(`PRAGMA table_info(user_economy)`)
      .all() as Array<{ name: string }>;
    if (
      userEcoCols.length > 0 &&
      !userEcoCols.some((c) => c.name === "daily_streak")
    ) {
      database.exec(
        `ALTER TABLE user_economy ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (
      userEcoCols.length > 0 &&
      !userEcoCols.some((c) => c.name === "last_daily_at")
    ) {
      database.exec(`ALTER TABLE user_economy ADD COLUMN last_daily_at INTEGER`);
    }
    if (
      userEcoCols.length > 0 &&
      !userEcoCols.some((c) => c.name === "last_weekly_at")
    ) {
      database.exec(
        `ALTER TABLE user_economy ADD COLUMN last_weekly_at INTEGER`,
      );
    }
    if (
      userEcoCols.length > 0 &&
      !userEcoCols.some((c) => c.name === "last_monthly_at")
    ) {
      database.exec(
        `ALTER TABLE user_economy ADD COLUMN last_monthly_at INTEGER`,
      );
    }
  } catch {
    /* ignore */
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS panel_users (
      user_id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS panel_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      access_token_enc TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES panel_users(user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_panel_sessions_user ON panel_sessions(user_id);
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY NOT NULL,
      code_verifier TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_action_logs_guild_created ON action_logs(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mod_logs_guild ON mod_logs(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_form_responses_form ON form_responses(form_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sent_embeds_guild ON sent_embeds(guild_id, created_at);
  `);
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
