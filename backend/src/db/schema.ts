import {
  integer,
  primaryKey,
  real,
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
 * Roles automáticos al unirse (humanos vs bots).
 */
export const autoRoles = sqliteTable("auto_roles", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  /** JSON: string[] role IDs */
  humanRoles: text("human_roles").notNull().default("[]"),
  /** JSON: string[] role IDs */
  botRoles: text("bot_roles").notNull().default("[]"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Menú interactivo de autoroles (metadatos + mapping JSON).
 * @deprecated Preferir `autoroles_registry`.
 */
export const reactionRolesMenus = sqliteTable("reaction_roles_menus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  mode: text("mode").notNull().default("reactions"),
  /** JSON: mappings (emoji/button → role) */
  rolesMapping: text("roles_mapping").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Registro persistente de menús de autoroles publicados.
 */
export const autorolesRegistry = sqliteTable("autoroles_registry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  title: text("title").notNull().default("Autoroles"),
  /** BUTTONS | SELECT | REACTIONS */
  type: text("type").notNull().default("BUTTONS"),
  /** JSON: [{ id, roleId, label, emojiKey, style }] */
  rolesMapping: text("roles_mapping").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
  /** Legacy: el módulo siempre opera como canvas (`card`). */
  welcomeMode: text("welcome_mode").notNull().default("card"),
  /** URL remota — opcional si hay bg_filepath. */
  backgroundUrl: text("background_url"),
  /** Ruta pública local: `/uploads/backgrounds/...` */
  bgFilepath: text("bg_filepath"),
  blurAmount: integer("blur_amount").notNull().default(4),
  /**
   * @deprecated Migrado a `textLayers`. Se mantiene para lectura legacy.
   */
  primaryText: text("primary_text").notNull().default("¡Bienvenido!"),
  /**
   * @deprecated Migrado a `textLayers`.
   */
  secondaryText: text("secondary_text").notNull().default("{username}"),
  /** Texto opcional del mensaje Discord (o descripción embed). */
  messageContent: text("message_content").notNull().default("{user}"),
  avatarX: integer("avatar_x").notNull().default(960),
  avatarY: integer("avatar_y").notNull().default(380),
  avatarSize: integer("avatar_size").notNull().default(280),
  avatarBorderWidth: integer("avatar_border_width").notNull().default(8),
  avatarBorderColor: text("avatar_border_color").notNull().default("#FFFFFF"),
  /**
   * @deprecated Coordenadas legacy; las capas viven en textLayers.
   */
  textX: integer("text_x").notNull().default(960),
  textY: integer("text_y").notNull().default(560),
  fontSize: integer("font_size").notNull().default(64),
  textColor: text("text_color").notNull().default("#FFFFFF"),
  /** JSON: WelcomeTextLayer[] */
  textLayers: text("text_layers"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Config canvas para eventos automatizados: leave | ban | boost.
 * Misma forma que welcome_settings (sin welcome_mode).
 */
export const canvasEventSettings = sqliteTable(
  "canvas_event_settings",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    /** `leave` | `ban` | `boost` */
    eventType: text("event_type").notNull(),
    channelId: text("channel_id"),
    isEnabled: integer("is_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    backgroundUrl: text("background_url"),
    bgFilepath: text("bg_filepath"),
    blurAmount: integer("blur_amount").notNull().default(4),
    primaryText: text("primary_text").notNull().default("¡Hasta pronto!"),
    secondaryText: text("secondary_text").notNull().default("{username}"),
    messageContent: text("message_content").notNull().default("{user}"),
    avatarX: integer("avatar_x").notNull().default(960),
    avatarY: integer("avatar_y").notNull().default(380),
    avatarSize: integer("avatar_size").notNull().default(280),
    avatarBorderWidth: integer("avatar_border_width").notNull().default(8),
    avatarBorderColor: text("avatar_border_color").notNull().default("#FFFFFF"),
    textX: integer("text_x").notNull().default(960),
    textY: integer("text_y").notNull().default(560),
    fontSize: integer("font_size").notNull().default(64),
    textColor: text("text_color").notNull().default("#FFFFFF"),
    textLayers: text("text_layers"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.eventType] }),
  ],
);

/**
 * Presencia global del bot (singleton).
 * Discord limpia Presence al reiniciar → se reaplica desde esta tabla en `ready`.
 */
export const botPresenceSettings = sqliteTable("bot_presence_settings", {
  /** Siempre `default` (una sola fila). */
  id: text("id").primaryKey().default("default"),
  status: text("status").notNull().default("online"),
  activityType: text("activity_type").notNull().default("Playing"),
  activityName: text("activity_name").notNull().default(""),
  streamUrl: text("stream_url"),
  state: text("state").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Advertencias de moderación por usuario/servidor.
 */
export const warnings = sqliteTable("warnings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Plantillas de embed reutilizables (moderación DM, anuncios, etc.).
 */
export const embedTemplates = sqliteTable("embed_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** JSON: EmbedPayload */
  embedData: text("embed_data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Mensajes embed enviados desde el panel (edición/borrado en vivo).
 */
export const sentEmbeds = sqliteTable("sent_embeds", {
  id: text("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  title: text("title"),
  /** JSON: EmbedPayload + components */
  embedData: text("embed_data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Registro de acciones de moderación del panel.
 */
export const modLogs = sqliteTable("mod_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  action: text("action").notNull(),
  targetUserId: text("target_user_id"),
  targetChannelId: text("target_channel_id"),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason").notNull().default(""),
  meta: text("meta"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Configuración de Action Logs por guild (canales, filtros, eventos).
 */
export const actionLogsConfig = sqliteTable("action_logs_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  /** GLOBAL | CATEGORY */
  routingMode: text("routing_mode").notNull().default("GLOBAL"),
  globalChannelId: text("global_channel_id"),
  /** JSON: { messages, members, server, assets } */
  channelsMapping: text("channels_mapping").notNull().default("{}"),
  /** JSON: string[] */
  ignoredChannels: text("ignored_channels").notNull().default("[]"),
  /** JSON: string[] */
  ignoredRoles: text("ignored_roles").notNull().default("[]"),
  ignoreBots: integer("ignore_bots", { mode: "boolean" })
    .notNull()
    .default(true),
  /** JSON: Record<eventKey, boolean> */
  enabledEvents: text("enabled_events").notNull().default("{}"),
  /** Días de retención en SQLite; 0 = sin límite. */
  dataRetentionDays: integer("data_retention_days").notNull().default(14),
  /** JSON: { [channelId]: webhookId } */
  webhooksMapping: text("webhooks_mapping").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Historial de Action Logs capturados por discord.js.
 */
export const actionLogs = sqliteTable("action_logs", {
  id: text("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  category: text("category").notNull(),
  eventType: text("event_type").notNull(),
  executorId: text("executor_id"),
  executorTag: text("executor_tag"),
  targetId: text("target_id"),
  targetTag: text("target_tag"),
  channelId: text("channel_id"),
  summary: text("summary").notNull().default(""),
  /** JSON con detalles / diff */
  details: text("details").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Configuración de Auto Mod por guild (filtros, exclusiones, canal de alertas).
 * Las infracciones se registran en `warnings` (sin tabla de strikes propia).
 */
export const autoModConfig = sqliteTable("auto_mod_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  /** JSON: AutoModFilters */
  filters: text("filters").notNull().default("{}"),
  /** JSON: string[] */
  ignoredRoles: text("ignored_roles").notNull().default("[]"),
  /** JSON: string[] */
  ignoredChannels: text("ignored_channels").notNull().default("[]"),
  logChannelId: text("log_channel_id"),
  /** Días para caducidad de Warns activos; 0 = nunca. */
  warnDecayDays: integer("warn_decay_days").notNull().default(30),
  /** JSON: AutoModPunishment[] */
  punishments: text("punishments").notNull().default("[]"),
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
export type AutoRoleRow = typeof autoRoles.$inferSelect;
export type NewAutoRoleRow = typeof autoRoles.$inferInsert;
export type ReactionRolesMenu = typeof reactionRolesMenus.$inferSelect;
export type NewReactionRolesMenu = typeof reactionRolesMenus.$inferInsert;
export type WelcomeSettings = typeof welcomeSettings.$inferSelect;
export type NewWelcomeSettings = typeof welcomeSettings.$inferInsert;
export type CanvasEventSettings = typeof canvasEventSettings.$inferSelect;
export type NewCanvasEventSettings = typeof canvasEventSettings.$inferInsert;
export type BotPresenceSettings = typeof botPresenceSettings.$inferSelect;
export type NewBotPresenceSettings = typeof botPresenceSettings.$inferInsert;
export type Warning = typeof warnings.$inferSelect;
export type NewWarning = typeof warnings.$inferInsert;
export type EmbedTemplate = typeof embedTemplates.$inferSelect;
export type NewEmbedTemplate = typeof embedTemplates.$inferInsert;
export type SentEmbed = typeof sentEmbeds.$inferSelect;
export type NewSentEmbed = typeof sentEmbeds.$inferInsert;
export type ModLog = typeof modLogs.$inferSelect;
export type NewModLog = typeof modLogs.$inferInsert;
export type ActionLogsConfigRow = typeof actionLogsConfig.$inferSelect;
export type NewActionLogsConfigRow = typeof actionLogsConfig.$inferInsert;
export type ActionLogRow = typeof actionLogs.$inferSelect;
export type NewActionLogRow = typeof actionLogs.$inferInsert;
export type AutoModConfigRow = typeof autoModConfig.$inferSelect;
export type NewAutoModConfigRow = typeof autoModConfig.$inferInsert;

/**
 * Configuración de Auto-delete por guild (reglas de borrado por canal).
 */
export const autoDeleteConfig = sqliteTable("auto_delete_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  /** JSON: AutoDeleteRule[] */
  rules: text("rules").notNull().default("[]"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AutoDeleteConfigRow = typeof autoDeleteConfig.$inferSelect;
export type NewAutoDeleteConfigRow = typeof autoDeleteConfig.$inferInsert;

/**
 * Configuración de Rangos y XP por guild.
 */
export const xpConfig = sqliteTable("xp_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  textXpMin: integer("text_xp_min").notNull().default(15),
  textXpMax: integer("text_xp_max").notNull().default(25),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
  voiceEnabled: integer("voice_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  voiceXpPerMinute: integer("voice_xp_per_minute").notNull().default(10),
  /** Multiplicador al transmitir pantalla (1.0 = sin bonus). */
  streamMultiplier: real("stream_multiplier").notNull().default(1),
  xpMultiplier: integer("xp_multiplier").notNull().default(1),
  /** JSON: string[] */
  ignoredRoles: text("ignored_roles").notNull().default("[]"),
  /** JSON: string[] */
  ignoredChannels: text("ignored_channels").notNull().default("[]"),
  levelUpChannelId: text("level_up_channel_id"),
  /** JSON: LevelsRoleMultiplier[] */
  customMultipliers: text("custom_multipliers").notNull().default("[]"),
  /** JSON: LevelsChannelMultiplier[] */
  customChannelMultipliers: text("custom_channel_multipliers")
    .notNull()
    .default("[]"),
  /** TEXT | EMBED | IMAGE */
  levelUpFormat: text("level_up_format").notNull().default("TEXT"),
  levelUpMessage: text("level_up_message")
    .notNull()
    .default("🎉 {user} subió al **nivel {level}**!"),
  levelUpEmbedTitle: text("level_up_embed_title")
    .notNull()
    .default("¡Subida de Nivel!"),
  levelUpEmbedColor: text("level_up_embed_color")
    .notNull()
    .default("#34E21D"),
  levelUpShowThumbnail: integer("level_up_show_thumbnail", { mode: "boolean" })
    .notNull()
    .default(true),
  levelUpImage: text("level_up_image"),
  liveLeaderboardChannelId: text("live_leaderboard_channel_id"),
  liveLeaderboardMessageId: text("live_leaderboard_message_id"),
  leaderboardEmbedTitle: text("leaderboard_embed_title")
    .notNull()
    .default("🏆 Tabla de Clasificación"),
  leaderboardEmbedDescription: text("leaderboard_embed_description")
    .notNull()
    .default(""),
  leaderboardEmbedColor: text("leaderboard_embed_color")
    .notNull()
    .default("#CA7AFF"),
  leaderboardShowThumbnail: integer("leaderboard_show_thumbnail", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Recompensas de rol por nivel. */
export const xpRewards = sqliteTable("xp_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  roleId: text("role_id").notNull(),
});

/** Progreso de XP por usuario en un guild. */
export const userXp = sqliteTable(
  "user_xp",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    /** Si está en el futuro, el usuario no gana XP (Auto Mod XP_FREEZE). */
    xpFrozenUntil: integer("xp_frozen_until", { mode: "timestamp_ms" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.guildId, table.userId] }),
  }),
);

export type XpConfigRow = typeof xpConfig.$inferSelect;
export type NewXpConfigRow = typeof xpConfig.$inferInsert;
export type XpRewardRow = typeof xpRewards.$inferSelect;
export type NewXpRewardRow = typeof xpRewards.$inferInsert;
export type UserXpRow = typeof userXp.$inferSelect;
export type NewUserXpRow = typeof userXp.$inferInsert;

/**
 * Formularios interactivos (Discord Modals) — varios por guild.
 */
export const guildForms = sqliteTable("guild_forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  modalTitle: text("modal_title").notNull().default("Formulario"),
  buttonLabel: text("button_label").notNull().default("Abrir formulario"),
  embedTitle: text("embed_title").notNull().default("Formulario del servidor"),
  embedDescription: text("embed_description")
    .notNull()
    .default("Haz clic en el botón para completar el formulario."),
  embedColor: text("embed_color").notNull().default("#5865F2"),
  embedImageUrl: text("embed_image_url"),
  embedThumbnailUrl: text("embed_thumbnail_url"),
  publishChannelId: text("publish_channel_id"),
  receptionChannelId: text("reception_channel_id"),
  /** JSON: FormQuestion[] */
  questions: text("questions").notNull().default("[]"),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(0),
  publishedChannelId: text("published_channel_id"),
  publishedMessageId: text("published_message_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type GuildFormRow = typeof guildForms.$inferSelect;
export type NewGuildFormRow = typeof guildForms.$inferInsert;

/**
 * Respuestas enviadas a formularios.
 */
export const formResponses = sqliteTable("form_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: integer("form_id")
    .notNull()
    .references(() => guildForms.id, { onDelete: "cascade" }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  username: text("username").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  /** JSON: FormAnswerEntry[] */
  answers: text("answers").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type FormResponseRow = typeof formResponses.$inferSelect;
export type NewFormResponseRow = typeof formResponses.$inferInsert;

/**
 * @deprecated Tabla legacy 1:1 por guild. Migrada a `guild_forms`.
 */
export const interactiveForms = sqliteTable("interactive_forms", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  modalTitle: text("modal_title").notNull().default("Formulario"),
  buttonLabel: text("button_label").notNull().default("Abrir formulario"),
  embedTitle: text("embed_title").notNull().default("Formulario del servidor"),
  embedDescription: text("embed_description")
    .notNull()
    .default("Haz clic en el botón para completar el formulario."),
  embedColor: text("embed_color").notNull().default("#5865F2"),
  publishChannelId: text("publish_channel_id"),
  receptionChannelId: text("reception_channel_id"),
  questions: text("questions").notNull().default("[]"),
  publishedChannelId: text("published_channel_id"),
  publishedMessageId: text("published_message_id"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type InteractiveFormsRow = typeof interactiveForms.$inferSelect;
export type NewInteractiveFormsRow = typeof interactiveForms.$inferInsert;

/**
 * Mensajes programados (cron) por guild.
 */
export const scheduledMessages = sqliteTable("scheduled_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  /** IANA timezone, ej. America/Mexico_City */
  timezone: text("timezone").notNull().default("UTC"),
  /** JSON: ScheduledFrequency */
  frequency: text("frequency").notNull().default("{}"),
  /** JSON: ScheduledEmbedData */
  embedData: text("embed_data").notNull().default("{}"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type ScheduledMessageRow = typeof scheduledMessages.$inferSelect;
export type NewScheduledMessageRow = typeof scheduledMessages.$inferInsert;

/**
 * Slash commands personalizados por guild.
 */
export const customCommands = sqliteTable("custom_commands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default("Comando personalizado"),
  /** JSON: CustomCommandResponseData */
  responseData: text("response_data").notNull().default("{}"),
  /** JSON: CustomCommandOptions */
  options: text("options").notNull().default("{}"),
  /** JSON: CustomCommandPermissions */
  permissions: text("permissions").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type CustomCommandRow = typeof customCommands.$inferSelect;
export type NewCustomCommandRow = typeof customCommands.$inferInsert;

/**
 * Permisos/visibilidad de slash commands nativos por guild.
 */
export const defaultCommandPermissions = sqliteTable(
  "default_command_permissions",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    commandName: text("command_name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** JSON: string[] role IDs */
    allowedRoles: text("allowed_roles").notNull().default("[]"),
    ephemeral: integer("ephemeral", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.commandName] }),
  ],
);

export type DefaultCommandPermissionRow =
  typeof defaultCommandPermissions.$inferSelect;
export type NewDefaultCommandPermissionRow =
  typeof defaultCommandPermissions.$inferInsert;

/** Valores semilla útiles en migraciones / seeds. */
export const DEFAULT_PLUGIN_NAMES = [
  "minecraft",
  "osu",
  "valorant",
  "gachas",
  "alerts",
] as const;
