import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Configuración por guild (núcleo).
 * Extensible sin romper plugins: campos nuevos se añaden aquí; flags de features van a plugins_enabled.
 */
export const guildSettings = pgTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),
  prefix: text("prefix").notNull().default("!"),
  /** Canal principal de Action Logs (null = sin logs configurados). */
  logChannelId: text("log_channel_id"),
  welcomeEnabled: boolean("welcome_enabled")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Plugins opcionales por guild (minecraft, osu, valorant, gachas, alerts…).
 * PK compuesta: un registro por (servidor, plugin).
 */
export const pluginsEnabled = pgTable(
  "plugins_enabled",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    pluginName: text("plugin_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
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
export const reactionRoles = pgTable(
  "reaction_roles",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    emojiKey: text("emoji_key").notNull(),
    roleId: text("role_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
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
export const autoRoles = pgTable("auto_roles", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  /** JSON: string[] role IDs */
  humanRoles: text("human_roles").notNull().default("[]"),
  /** JSON: string[] role IDs */
  botRoles: text("bot_roles").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Menú interactivo de autoroles (metadatos + mapping JSON).
 * @deprecated Preferir `autoroles_registry`.
 */
export const reactionRolesMenus = pgTable("reaction_roles_menus", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  mode: text("mode").notNull().default("reactions"),
  /** JSON: mappings (emoji/button → role) */
  rolesMapping: text("roles_mapping").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Registro persistente de menús de autoroles publicados.
 */
export const autorolesRegistry = pgTable("autoroles_registry", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Tarjeta de bienvenida por servidor (imagen PNG generada).
 */
export const welcomeSettings = pgTable("welcome_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id"),
  isEnabled: boolean("is_enabled")
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
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Config canvas para eventos automatizados: leave | ban | boost.
 * Misma forma que welcome_settings (sin welcome_mode).
 */
export const canvasEventSettings = pgTable(
  "canvas_event_settings",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    /** `leave` | `ban` | `boost` */
    eventType: text("event_type").notNull(),
    channelId: text("channel_id"),
    isEnabled: boolean("is_enabled")
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
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
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
export const botPresenceSettings = pgTable("bot_presence_settings", {
  /** Siempre `default` (una sola fila). */
  id: text("id").primaryKey().default("default"),
  status: text("status").notNull().default("online"),
  activityType: text("activity_type").notNull().default("Playing"),
  activityName: text("activity_name").notNull().default(""),
  streamUrl: text("stream_url"),
  state: text("state").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Advertencias de moderación por usuario/servidor.
 */
export const warnings = pgTable(
  "warnings",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    moderatorId: text("moderator_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_warnings_guild_user").on(table.guildId, table.userId)],
);

/**
 * Plantillas de embed reutilizables (moderación DM, anuncios, etc.).
 */
export const embedTemplates = pgTable("embed_templates", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** JSON: EmbedPayload */
  embedData: text("embed_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Mensajes embed enviados desde el panel (edición/borrado en vivo).
 */
export const sentEmbeds = pgTable(
  "sent_embeds",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    title: text("title"),
    /** JSON: EmbedPayload + components */
    embedData: text("embed_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_sent_embeds_guild").on(table.guildId, table.createdAt),
  ],
);

/**
 * Registro de acciones de moderación del panel.
 */
export const modLogs = pgTable(
  "mod_logs",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetUserId: text("target_user_id"),
    targetChannelId: text("target_channel_id"),
    moderatorId: text("moderator_id").notNull(),
    reason: text("reason").notNull().default(""),
    meta: text("meta"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_mod_logs_guild").on(table.guildId, table.createdAt),
  ],
);

/**
 * Configuración de Action Logs por guild (canales, filtros, eventos).
 */
export const actionLogsConfig = pgTable("action_logs_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  /** GLOBAL | CATEGORY */
  routingMode: text("routing_mode").notNull().default("GLOBAL"),
  globalChannelId: text("global_channel_id"),
  /** JSON: { messages, members, server, assets } */
  channelsMapping: text("channels_mapping").notNull().default("{}"),
  /** JSON: string[] */
  ignoredChannels: text("ignored_channels").notNull().default("[]"),
  /** JSON: string[] */
  ignoredRoles: text("ignored_roles").notNull().default("[]"),
  ignoreBots: boolean("ignore_bots")
    .notNull()
    .default(true),
  /** JSON: Record<eventKey, boolean> */
  enabledEvents: text("enabled_events").notNull().default("{}"),
  /** Días de retención del historial; 0 = sin límite. */
  dataRetentionDays: integer("data_retention_days").notNull().default(14),
  /** JSON: { [channelId]: webhookId } */
  webhooksMapping: text("webhooks_mapping").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Historial de Action Logs capturados por discord.js.
 */
export const actionLogs = pgTable(
  "action_logs",
  {
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_action_logs_guild_created").on(table.guildId, table.createdAt),
  ],
);

/**
 * Configuración de Auto Mod por guild (filtros, exclusiones, canal de alertas).
 * Las infracciones se registran en `warnings` (sin tabla de strikes propia).
 */
export const autoModConfig = pgTable("auto_mod_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  /** JSON: AutoModFilters */
  filters: text("filters").notNull().default("{}"),
  /** JSON: string[] */
  ignoredRoles: text("ignored_roles").notNull().default("[]"),
  /** JSON: string[] */
  ignoredChannels: text("ignored_channels").notNull().default("[]"),
  logChannelId: text("log_channel_id"),
  /** Días para caducidad de Warns activos; 0 = nunca. */
  warnDecayDays: integer("warn_decay_days").notNull().default(30),
  /** Registrar warn en cada hit de filtro (default: sí, comportamiento histórico). */
  warnOnHit: boolean("warn_on_hit").notNull().default(true),
  /** DM al usuario junto al warn. Ignorado si warnOnHit es false. */
  dmOnHit: boolean("dm_on_hit").notNull().default(true),
  /** Saltar Administrator / ManageMessages. */
  skipStaff: boolean("skip_staff").notNull().default(false),
  /** JSON: AutoModPunishment[] */
  punishments: text("punishments").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
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
export const autoDeleteConfig = pgTable("auto_delete_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  /** JSON: AutoDeleteRule[] */
  rules: text("rules").notNull().default("[]"),
  /** IANA timezone del cron SCHEDULED. */
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AutoDeleteConfigRow = typeof autoDeleteConfig.$inferSelect;
export type NewAutoDeleteConfigRow = typeof autoDeleteConfig.$inferInsert;

/** COUNTDOWN pendiente: el leader borra al vencer delete_at. */
export const autoDeletePending = pgTable(
  "auto_delete_pending",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    ruleChannelId: text("rule_channel_id").notNull(),
    deleteAt: timestamp("delete_at", { withTimezone: true, mode: "date" })
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.messageId] }),
    index("idx_auto_delete_pending_due").on(table.deleteAt),
    index("idx_auto_delete_pending_rule").on(
      table.guildId,
      table.ruleChannelId,
    ),
  ],
);

/**
 * Configuración de Levels por guild.
 */
export const xpConfig = pgTable("xp_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  textXpMin: integer("text_xp_min").notNull().default(15),
  textXpMax: integer("text_xp_max").notNull().default(25),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(60),
  voiceEnabled: boolean("voice_enabled")
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
  levelUpShowThumbnail: boolean("level_up_show_thumbnail")
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
  leaderboardShowThumbnail: boolean("leaderboard_show_thumbnail")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Recompensas de rol por nivel. Un rol por (guild, level). */
export const xpRewards = pgTable(
  "xp_rewards",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [
    uniqueIndex("idx_xp_rewards_guild_level").on(table.guildId, table.level),
  ],
);

/** Progreso de XP por usuario en un guild. */
export const userXp = pgTable(
  "user_xp",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    /** Si está en el futuro, el usuario no gana XP (Auto Mod XP_FREEZE). */
    xpFrozenUntil: timestamp("xp_frozen_until", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
  ],
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
export const guildForms = pgTable("guild_forms", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
  enabled: boolean("enabled").notNull().default(true),
  /** cooldown | once */
  submitMode: text("submit_mode").notNull().default("cooldown"),
  /** JSON: snowflake[] */
  requiredRoleIds: text("required_role_ids").notNull().default("[]"),
  /** JSON: snowflake[] */
  blockedRoleIds: text("blocked_role_ids").notNull().default("[]"),
  pingRoleId: text("ping_role_id"),
  thankYouMessage: text("thank_you_message").notNull().default(""),
  acceptRoleId: text("accept_role_id"),
  publishedChannelId: text("published_channel_id"),
  publishedMessageId: text("published_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type GuildFormRow = typeof guildForms.$inferSelect;
export type NewGuildFormRow = typeof guildForms.$inferInsert;

/**
 * Respuestas enviadas a formularios.
 */
export const formResponses = pgTable(
  "form_responses",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
    /** pending | accepted | rejected */
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_form_responses_form").on(table.formId, table.createdAt),
    index("idx_form_responses_user").on(
      table.formId,
      table.userId,
      table.createdAt,
    ),
  ],
);

export type FormResponseRow = typeof formResponses.$inferSelect;
export type NewFormResponseRow = typeof formResponses.$inferInsert;

/**
 * @deprecated Tabla legacy 1:1 por guild. Migrada a `guild_forms`.
 */
export const interactiveForms = pgTable("interactive_forms", {
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
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type InteractiveFormsRow = typeof interactiveForms.$inferSelect;
export type NewInteractiveFormsRow = typeof interactiveForms.$inferInsert;

/**
 * Scheduled Messages: horario persistido (`next_run_at`) por guild.
 */
export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
    content: text("content").notNull().default(""),
    pingRoleId: text("ping_role_id"),
    isActive: boolean("is_active").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_scheduled_messages_due").on(table.isActive, table.nextRunAt),
  ],
);

export type ScheduledMessageRow = typeof scheduledMessages.$inferSelect;
export type NewScheduledMessageRow = typeof scheduledMessages.$inferInsert;

/**
 * Slash commands personalizados por guild.
 */
export const customCommands = pgTable(
  "custom_commands",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
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
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_custom_commands_guild_name").on(table.guildId, table.name),
  ],
);

export type CustomCommandRow = typeof customCommands.$inferSelect;
export type NewCustomCommandRow = typeof customCommands.$inferInsert;

/**
 * Permisos/visibilidad de slash commands nativos por guild.
 */
export const defaultCommandPermissions = pgTable(
  "default_command_permissions",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    commandName: text("command_name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** JSON: string[] role IDs */
    allowedRoles: text("allowed_roles").notNull().default("[]"),
    /** JSON: string[] channel IDs donde el comando no se puede usar */
    ignoredChannels: text("ignored_channels").notNull().default("[]"),
    ephemeral: boolean("ephemeral").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
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

/**
 * Configuración global de economía por guild.
 */
export const economyConfig = pgTable("economy_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(false),
  currencyName: text("currency_name").notNull().default("Adobos Coins"),
  currencySymbol: text("currency_symbol").notNull().default("🪙"),
  startBalance: integer("start_balance").notNull().default(0),
  transferTax: integer("transfer_tax").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type EconomyConfigRow = typeof economyConfig.$inferSelect;
export type NewEconomyConfigRow = typeof economyConfig.$inferInsert;

/**
 * Saldos de economía por usuario/guild.
 */
export const userEconomy = pgTable(
  "user_economy",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    wallet: integer("wallet").notNull().default(0),
    bank: integer("bank").notNull().default(0),
    /** Racha de /daily. */
    dailyStreak: integer("daily_streak").notNull().default(0),
    /** Última reclamación de /daily (ms). null = nunca. */
    lastDailyAt: timestamp("last_daily_at", { withTimezone: true, mode: "date" }),
    /** Última reclamación de /weekly. */
    lastWeeklyAt: timestamp("last_weekly_at", { withTimezone: true, mode: "date" }),
    /** Última reclamación de /monthly. */
    lastMonthlyAt: timestamp("last_monthly_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
  ],
);

export type UserEconomyRow = typeof userEconomy.$inferSelect;
export type NewUserEconomyRow = typeof userEconomy.$inferInsert;

/**
 * Apuesta de blackjack cobrada mientras la mano vive en memoria.
 * Si el proceso muere, el arranque reembolsa `bet`.
 */
export const economyBlackjackOpen = pgTable(
  "economy_blackjack_open",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    bet: integer("bet").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export type EconomyBlackjackOpenRow = typeof economyBlackjackOpen.$inferSelect;

/**
 * Cooldowns de comandos de economía (`work`, `crime`, etc.).
 */
export const economyCooldowns = pgTable(
  "economy_cooldowns",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** Clave: `work` | `crime` | … */
    commandKey: text("command_key").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.guildId, table.userId, table.commandKey],
    }),
  ],
);

export type EconomyCooldownRow = typeof economyCooldowns.$inferSelect;

/**
 * Config de ingresos: daily/weekly/monthly, rachas, salarios por rol,
 * trabajos (`/work`) y crímenes (`/crime`) — arrays JSON.
 */
export const economyIncome = pgTable("economy_income", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  dailyPay: integer("daily_pay").notNull().default(100),
  weeklyPay: integer("weekly_pay").notNull().default(500),
  monthlyPay: integer("monthly_pay").notNull().default(2000),
  streakEnabled: boolean("streak_enabled")
    .notNull()
    .default(false),
  streakBonusPercent: integer("streak_bonus_percent").notNull().default(5),
  /** EconomyRoleSalary[] */
  roleSalaries: text("role_salaries").notNull().default("[]"),
  /** EconomyJob[] */
  jobs: text("jobs").notNull().default("[]"),
  /** EconomyCrime[] */
  crimes: text("crimes").notNull().default("[]"),
  /** EconomyRobConfig JSON. */
  rob: text("rob").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type EconomyIncomeRow = typeof economyIncome.$inferSelect;
export type NewEconomyIncomeRow = typeof economyIncome.$inferInsert;

/**
 * Catálogo de la tienda del servidor (`/shop`, `/buy`).
 */
export const economyShopItems = pgTable(
  "economy_shop_items",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    price: integer("price").notNull().default(0),
    icon: text("icon").notNull().default("🛒"),
    /** null = infinito (almacenado como NULL). */
    stock: integer("stock"),
    /** EconomyShopRewards JSON (Smart Toggles). */
    rewards: text("rewards").notNull().default("{}"),
    /** @deprecated Secuencia Shortcuts; se migra al leer. */
    actionSequence: text("action_sequence").default("[]"),
    /** @deprecated Legacy single-reward; se migra al leer. */
    rewardType: text("reward_type"),
    /** @deprecated */
    rewardConfig: text("reward_config").default("{}"),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("economy_shop_items_guild_idx").on(table.guildId)],
);

export type EconomyShopItemRow = typeof economyShopItems.$inferSelect;
export type NewEconomyShopItemRow = typeof economyShopItems.$inferInsert;

/**
 * Historial de compras de la tienda.
 */
export const economyPurchases = pgTable(
  "economy_purchases",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    pricePaid: integer("price_paid").notNull(),
    status: text("status").notNull().default("fulfilled"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("economy_purchases_guild_user_idx").on(table.guildId, table.userId),
  ],
);

export type EconomyPurchaseRow = typeof economyPurchases.$inferSelect;
export type NewEconomyPurchaseRow = typeof economyPurchases.$inferInsert;

/**
 * Boosts temporales comprados (XP / economía).
 */
export const economyUserBoosts = pgTable(
  "economy_user_boosts",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    module: text("module").notNull(),
    multiplier: integer("multiplier").notNull(),
    /** null = boost permanente. */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    purchaseId: text("purchase_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("economy_user_boosts_lookup_idx").on(
      table.guildId,
      table.userId,
      table.module,
    ),
  ],
);

export type EconomyUserBoostRow = typeof economyUserBoosts.$inferSelect;

/**
 * Roles custom creados por la tienda (para /myrole).
 */
export const economyOwnedRoles = pgTable(
  "economy_owned_roles",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    itemId: text("item_id"),
    purchaseId: text("purchase_id"),
    /** null = permanente. */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    /**
     * true = borrar el rol de Discord al expirar (creado por la tienda);
     * false = solo quitarlo del miembro (rol existente temporal).
     */
    deleteRoleOnExpire: boolean("delete_role_on_expire")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("economy_owned_roles_user_idx").on(table.guildId, table.userId),
  ],
);

export type EconomyOwnedRoleRow = typeof economyOwnedRoles.$inferSelect;

/**
 * Canales creados por la tienda (temporales o permanentes).
 */
export const economyOwnedChannels = pgTable(
  "economy_owned_channels",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    itemId: text("item_id"),
    purchaseId: text("purchase_id"),
    /** null = permanente. */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("economy_owned_channels_user_idx").on(table.guildId, table.userId),
  ],
);

export type EconomyOwnedChannelRow = typeof economyOwnedChannels.$inferSelect;

/**
 * Config del Casino por guild (límites globales + reglas por juego).
 */
export const economyCasino = pgTable("economy_casino", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(false),
  minBet: integer("min_bet").notNull().default(10),
  maxBet: integer("max_bet").notNull().default(10_000),
  /** EconomyCasinoCoinflipConfig JSON. */
  coinflip: text("coinflip").notNull().default("{}"),
  /** EconomyCasinoRouletteConfig JSON. */
  roulette: text("roulette").notNull().default("{}"),
  /** EconomyCasinoBlackjackConfig JSON. */
  blackjack: text("blackjack").notNull().default("{}"),
  /** EconomyCasinoSlotsConfig JSON. */
  slots: text("slots").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type EconomyCasinoRow = typeof economyCasino.$inferSelect;
export type NewEconomyCasinoRow = typeof economyCasino.$inferInsert;

/**
 * Config del plugin Pokémon por guild.
 */
export const pluginPokemonConfig = pgTable("plugin_pokemon_config", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(false),
  defaultGeneration: integer("default_generation").notNull().default(9),
  language: text("language").notNull().default("es"),
  embedColor: text("embed_color").notNull().default("#EF4444"),
  forceEphemeral: boolean("force_ephemeral")
    .notNull()
    .default(true),
  /** string[] JSON — lista blanca de canales. */
  allowedChannels: text("allowed_channels").notNull().default("[]"),
  /** string[] JSON — lista blanca de roles (vacía = everyone). */
  allowedRoles: text("allowed_roles").notNull().default("[]"),
  /** PokemonCommandsEnabled JSON. */
  commands: text("commands").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type PluginPokemonConfigRow = typeof pluginPokemonConfig.$inferSelect;
export type NewPluginPokemonConfigRow = typeof pluginPokemonConfig.$inferInsert;

/** Usuarios del panel (OAuth Discord). */
export const panelUsers = pgTable("panel_users", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull(),
  globalName: text("global_name"),
  avatar: text("avatar"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Sesiones opacas del panel. */
export const panelSessions = pgTable(
  "panel_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => panelUsers.userId, { onDelete: "cascade" }),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    accessExpiresAt: timestamp("access_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_panel_sessions_user").on(table.userId)],
);

/** State OAuth de un solo uso (anti-CSRF + PKCE verifier). */
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

/**
 * Usuario Discord ↔ customer de Stripe. El portal y checkout reutilizan este id.
 */
export const billingCustomers = pgTable("billing_customers", {
  userId: text("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Suscripción de un usuario Discord. Stripe (webhook) rellena status/periodo.
 * `can(guildId, feature)` no consulta esta tabla: lee `guild_entitlements`.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: text("user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),
    tier: text("tier").notNull().default("pro"),
    /** active | trialing | past_due | paused | canceled | unpaid */
    status: text("status").notNull().default("active"),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
      mode: "date",
    }),
    cancelAt: timestamp("cancel_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_subscriptions_user").on(table.userId)],
);

/**
 * Plan efectivo por servidor. Fuente de verdad de `can()` / `limit()`.
 * Sin fila = free. Stripe (0.12) actualiza esta tabla, nunca se consulta en caliente.
 */
export const guildEntitlements = pgTable(
  "guild_entitlements",
  {
    guildId: text("guild_id").primaryKey(),
    subscriptionId: integer("subscription_id").references(
      () => subscriptions.id,
      { onDelete: "set null" },
    ),
    tier: text("tier").notNull().default("free"),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_guild_entitlements_subscription").on(table.subscriptionId),
  ],
);

/**
 * Idempotencia de webhooks de Stripe (`event.id`).
 */
export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type GuildEntitlementRow = typeof guildEntitlements.$inferSelect;
export type BillingCustomerRow = typeof billingCustomers.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;

/**
 * Generadores Join to Create (Voice Rooms).
 */
export const voiceRoomGenerators = pgTable(
  "voice_room_generators",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    hubChannelId: text("hub_channel_id").notNull(),
    categoryId: text("category_id"),
    nameTemplate: text("name_template").notNull().default("{user}'s room"),
    defaultUserLimit: integer("default_user_limit").notNull().default(0),
    defaultBitrate: integer("default_bitrate").notNull().default(0),
    autoText: boolean("auto_text").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    /** JSON: VoiceRoomActionMap */
    allowedActions: text("allowed_actions").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("voice_room_generators_guild_hub").on(
      table.guildId,
      table.hubChannelId,
    ),
  ],
);

/**
 * Salas temporales vivas. channel_id = VC de Discord.
 */
export const voiceRooms = pgTable(
  "voice_rooms",
  {
    channelId: text("channel_id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    generatorId: integer("generator_id")
      .notNull()
      .references(() => voiceRoomGenerators.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    textChannelId: text("text_channel_id"),
    locked: boolean("locked").notNull().default(false),
    ghosted: boolean("ghosted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("voice_rooms_guild_owner").on(table.guildId, table.ownerId),
    index("idx_voice_rooms_guild").on(table.guildId),
  ],
);

export type VoiceRoomGeneratorRow = typeof voiceRoomGenerators.$inferSelect;
export type VoiceRoomRow = typeof voiceRooms.$inferSelect;

/**
 * Ajustes de Reminders por guild (timezone para `/remind at`).
 */
export const reminderSettings = pgTable("reminder_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("UTC"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Recordatorios personales pendientes. Se borran al disparar.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    message: text("message").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_reminders_due").on(table.dueAt),
    index("idx_reminders_guild_user").on(table.guildId, table.userId),
  ],
);

export type ReminderSettingsRow = typeof reminderSettings.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;

/**
 * Un tablón Starboard por guild. emojis / ignore_channel_ids son JSON texto.
 */
export const starboardSettings = pgTable("starboard_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text("channel_id"),
  /** JSON: string[] de claves unicode:/custom: */
  emojis: text("emojis").notNull().default('["unicode:⭐"]'),
  threshold: integer("threshold").notNull().default(3),
  enabled: boolean("enabled").notNull().default(false),
  allowSelfStar: boolean("allow_self_star").notNull().default(false),
  allowBots: boolean("allow_bots").notNull().default(false),
  /** JSON: snowflake[] */
  ignoreChannelIds: text("ignore_channel_ids").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Copia en el canal del tablón. original_message_id es el mensaje fuente.
 */
export const starboardPosts = pgTable(
  "starboard_posts",
  {
    originalMessageId: text("original_message_id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    starboardMessageId: text("starboard_message_id").notNull(),
    starCount: integer("star_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("starboard_posts_starboard_message").on(
      table.starboardMessageId,
    ),
    index("idx_starboard_posts_guild").on(table.guildId),
  ],
);

export type StarboardSettingsRow = typeof starboardSettings.$inferSelect;
export type StarboardPostRow = typeof starboardPosts.$inferSelect;

/**
 * Anti-Raid por guild. lockdown_snapshot y umbrales nuke son JSON texto.
 */
export const antiRaidSettings = pgTable("anti_raid_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  alertChannelId: text("alert_channel_id"),
  joinFloodEnabled: boolean("join_flood_enabled").notNull().default(true),
  joinCount: integer("join_count").notNull().default(10),
  joinWindowSeconds: integer("join_window_seconds").notNull().default(10),
  joinAction: text("join_action").notNull().default("kick"),
  accountAgeEnabled: boolean("account_age_enabled").notNull().default(false),
  accountAgeDays: integer("account_age_days").notNull().default(7),
  accountAgeAction: text("account_age_action").notNull().default("kick"),
  lockdownJoinAction: text("lockdown_join_action").notNull().default("timeout"),
  timeoutSeconds: integer("timeout_seconds").notNull().default(3600),
  whitelistRoleIds: text("whitelist_role_ids").notNull().default("[]"),
  nukeEnabled: boolean("nuke_enabled").notNull().default(false),
  nukeWindowSeconds: integer("nuke_window_seconds").notNull().default(10),
  nukePunishment: text("nuke_punishment").notNull().default("strip"),
  nukeThresholds: text("nuke_thresholds").notNull().default("{}"),
  nukeWhitelistUserIds: text("nuke_whitelist_user_ids").notNull().default("[]"),
  nukeWhitelistRoleIds: text("nuke_whitelist_role_ids").notNull().default("[]"),
  lockdownActive: boolean("lockdown_active").notNull().default(false),
  lockdownStartedAt: timestamp("lockdown_started_at", {
    withTimezone: true,
    mode: "date",
  }),
  lockdownByUserId: text("lockdown_by_user_id"),
  lockdownSnapshot: text("lockdown_snapshot").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AntiRaidSettingsRow = typeof antiRaidSettings.$inferSelect;

/**
 * Alertas de stream por guild. Una fila = un canal de Twitch/YouTube/Kick.
 * is_live / live_id evitan reanunciar el mismo directo tras un restart.
 */
export const streamAlerts = pgTable(
  "stream_alerts",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    discordChannelId: text("discord_channel_id").notNull(),
    mentionRoleId: text("mention_role_id"),
    template: text("template")
      .notNull()
      .default("{name} está en directo: {title}\n{url}"),
    enabled: boolean("enabled").notNull().default(true),
    isLive: boolean("is_live").notNull().default(false),
    liveId: text("live_id"),
    lastTitle: text("last_title"),
    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastLiveAt: timestamp("last_live_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("stream_alerts_guild_platform_handle").on(
      table.guildId,
      table.platform,
      table.handle,
    ),
    index("idx_stream_alerts_guild").on(table.guildId),
    index("idx_stream_alerts_enabled").on(table.enabled),
  ],
);

export type StreamAlertRow = typeof streamAlerts.$inferSelect;

/**
 * Auto-Replies: trigger de texto → respuesta. No es Custom Command (slash).
 */
export const autoReplies = pgTable(
  "auto_replies",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    matchMode: text("match_mode").notNull().default("contains"),
    response: text("response").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    caseSensitive: boolean("case_sensitive").notNull().default(false),
    wholeWord: boolean("whole_word").notNull().default(false),
    useReply: boolean("use_reply").notNull().default(true),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
    allowedChannelIds: text("allowed_channel_ids").notNull().default("[]"),
    ignoredChannelIds: text("ignored_channel_ids").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_auto_replies_guild").on(table.guildId)],
);

export type AutoReplyRow = typeof autoReplies.$inferSelect;

/** Valores semilla útiles en migraciones / seeds. */
export const DEFAULT_PLUGIN_NAMES = [
  "minecraft",
  "osu",
  "valorant",
  "gachas",
  "alerts",
] as const;
