import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Configuración por guild (núcleo).
 * Extensible sin romper plugins: campos nuevos se añaden aquí; flags de features van a plugins_enabled.
 */
export const guildSettings = sqliteTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),
  prefix: text("prefix").notNull().default("!"),
  /** Canal principal de Action Logs (null = sin logs configurados). */
  logChannelId: text("log_channel_id"),
  welcomeEnabled: integer("welcome_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Plugins opcionales por guild (minecraft, osu, valorant, gachas, alerts…).
 * PK compuesta: un registro por (servidor, plugin).
 */
export const pluginsEnabled = sqliteTable(
  "plugins_enabled",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    pluginName: text("plugin_name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.pluginName] }),
  ],
);

export type GuildSettings = typeof guildSettings.$inferSelect;
export type NewGuildSettings = typeof guildSettings.$inferInsert;
export type PluginEnabled = typeof pluginsEnabled.$inferSelect;
export type NewPluginEnabled = typeof pluginsEnabled.$inferInsert;

/** Valores semilla útiles en migraciones / seeds. */
export const DEFAULT_PLUGIN_NAMES = [
  "minecraft",
  "osu",
  "valorant",
  "gachas",
  "alerts",
] as const;
