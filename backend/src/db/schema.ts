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

/**
 * Autoroles por reacción: un emoji en un mensaje concreto asigna/quita un rol.
 * emojiKey: `custom:<id>` o `unicode:<char>`
 */
export const reactionRoles = sqliteTable(
  "reaction_roles",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    emojiKey: text("emoji_key").notNull(),
    roleId: text("role_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.emojiKey] }),
  ],
);

/**
 * Tarjeta de bienvenida por servidor (imagen PNG generada).
 */
export const welcomeSettings = sqliteTable("welcome_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id"),
  isEnabled: integer("is_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  /** URL remota (galería) — opcional si hay bg_filepath. */
  backgroundUrl: text("background_url"),
  /** Ruta pública local: `/uploads/backgrounds/...` */
  bgFilepath: text("bg_filepath"),
  blurAmount: integer("blur_amount").notNull().default(4),
  primaryText: text("primary_text").notNull().default("¡Bienvenido!"),
  secondaryText: text("secondary_text").notNull().default("{username}"),
  /** Texto opcional del mensaje Discord encima de la tarjeta. */
  messageContent: text("message_content").notNull().default("{user}"),
  avatarX: integer("avatar_x").notNull().default(960),
  avatarY: integer("avatar_y").notNull().default(380),
  /** Diámetro del avatar en px (mín. 280 = tamaño base). */
  avatarSize: integer("avatar_size").notNull().default(280),
  textX: integer("text_x").notNull().default(960),
  textY: integer("text_y").notNull().default(560),
  /** Tamaño de letra del texto principal (px). */
  fontSize: integer("font_size").notNull().default(64),
  textColor: text("text_color").notNull().default("#FFFFFF"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type GuildSettings = typeof guildSettings.$inferSelect;
export type NewGuildSettings = typeof guildSettings.$inferInsert;
export type PluginEnabled = typeof pluginsEnabled.$inferSelect;
export type NewPluginEnabled = typeof pluginsEnabled.$inferInsert;
export type ReactionRole = typeof reactionRoles.$inferSelect;
export type NewReactionRole = typeof reactionRoles.$inferInsert;
export type WelcomeSettings = typeof welcomeSettings.$inferSelect;
export type NewWelcomeSettings = typeof welcomeSettings.$inferInsert;

/** Valores semilla útiles en migraciones / seeds. */
export const DEFAULT_PLUGIN_NAMES = [
  "minecraft",
  "osu",
  "valorant",
  "gachas",
  "alerts",
] as const;
