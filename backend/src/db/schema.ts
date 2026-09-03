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
  guildId: text().primaryKey(),
  prefix: text().notNull().default("!"),
  /** Canal principal de Action Logs (null = sin logs configurados). */
  logChannelId: text(),
  welcomeEnabled: boolean().notNull().default(false),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    pluginName: text().notNull(),
    enabled: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.pluginName] })],
);

/**
 * Autoroles por reacción: un emoji en un mensaje concreto asigna/quita un rol.
 * emojiKey: `custom:<id>` o `unicode:<char>`
 */
export const reactionRoles = pgTable(
  "reaction_roles",
  {
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text().notNull(),
    messageId: text().notNull(),
    emojiKey: text().notNull(),
    roleId: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.emojiKey] })],
);

/**
 * Roles automáticos al unirse (humanos vs bots).
 */
export const autoRoles = pgTable("auto_roles", {
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  /** JSON: string[] role IDs */
  humanRoles: text().notNull().default("[]"),
  /** JSON: string[] role IDs */
  botRoles: text().notNull().default("[]"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Menú interactivo de autoroles (metadatos + mapping JSON).
 * @deprecated Preferir `autoroles_registry`.
 */
export const reactionRolesMenus = pgTable("reaction_roles_menus", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  guildId: text()
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text().notNull(),
  messageId: text().notNull(),
  mode: text().notNull().default("reactions"),
  /** JSON: mappings (emoji/button → role) */
  rolesMapping: text().notNull().default("[]"),
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Registro persistente de menús de autoroles publicados.
 */
export const autorolesRegistry = pgTable("autoroles_registry", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  guildId: text()
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text().notNull(),
  messageId: text().notNull(),
  title: text().notNull().default("Autoroles"),
  /** BUTTONS | SELECT | REACTIONS */
  type: text().notNull().default("BUTTONS"),
  /** JSON: [{ id, roleId, label, emojiKey, style }] */
  rolesMapping: text().notNull().default("[]"),
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Tarjeta de bienvenida por servidor (imagen PNG generada).
 */
export const welcomeSettings = pgTable("welcome_settings", {
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text(),
  isEnabled: boolean().notNull().default(false),
  /** Legacy: el módulo siempre opera como canvas (`card`). */
  welcomeMode: text().notNull().default("card"),
  /** URL remota — opcional si hay bg_filepath. */
  backgroundUrl: text(),
  /** Ruta pública local: `/uploads/backgrounds/...` */
  bgFilepath: text(),
  blurAmount: integer().notNull().default(4),
  /**
   * @deprecated Migrado a `textLayers`. Se mantiene para lectura legacy.
   */
  primaryText: text().notNull().default("Welcome!"),
  /**
   * @deprecated Migrado a `textLayers`.
   */
  secondaryText: text().notNull().default("{username}"),
  /** Texto opcional del mensaje Discord (o descripción embed). */
  messageContent: text().notNull().default("{user}"),
  avatarX: integer().notNull().default(960),
  avatarY: integer().notNull().default(380),
  avatarSize: integer().notNull().default(280),
  avatarBorderWidth: integer().notNull().default(8),
  avatarBorderColor: text().notNull().default("#FFFFFF"),
  /**
   * @deprecated Coordenadas legacy; las capas viven en textLayers.
   */
  textX: integer().notNull().default(960),
  textY: integer().notNull().default(560),
  fontSize: integer().notNull().default(64),
  textColor: text().notNull().default("#FFFFFF"),
  /** JSON: WelcomeTextLayer[] */
  textLayers: text(),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    /** `leave` | `ban` | `boost` */
    eventType: text().notNull(),
    channelId: text(),
    isEnabled: boolean().notNull().default(false),
    backgroundUrl: text(),
    bgFilepath: text(),
    blurAmount: integer().notNull().default(4),
    primaryText: text().notNull().default("See you soon!"),
    secondaryText: text().notNull().default("{username}"),
    messageContent: text().notNull().default("{user}"),
    avatarX: integer().notNull().default(960),
    avatarY: integer().notNull().default(380),
    avatarSize: integer().notNull().default(280),
    avatarBorderWidth: integer().notNull().default(8),
    avatarBorderColor: text().notNull().default("#FFFFFF"),
    textX: integer().notNull().default(960),
    textY: integer().notNull().default(560),
    fontSize: integer().notNull().default(64),
    textColor: text().notNull().default("#FFFFFF"),
    textLayers: text(),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.eventType] })],
);

/**
 * Presencia global del bot (singleton).
 * Discord limpia Presence al reiniciar → se reaplica desde esta tabla en `ready`.
 */
export const botPresenceSettings = pgTable("bot_presence_settings", {
  /** Siempre `default` (una sola fila). */
  id: text().primaryKey().default("default"),
  status: text().notNull().default("online"),
  activityType: text().notNull().default("Playing"),
  activityName: text().notNull().default(""),
  streamUrl: text(),
  state: text().notNull().default(""),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Advertencias de moderación por usuario/servidor.
 */
export const warnings = pgTable(
  "warnings",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    moderatorId: text().notNull(),
    reason: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_warnings_guild_user").on(table.guildId, table.userId)],
);

/**
 * Plantillas de embed reutilizables (moderación DM, anuncios, etc.).
 */
export const embedTemplates = pgTable("embed_templates", {
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  guildId: text()
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  name: text().notNull(),
  /** JSON: EmbedPayload */
  embedData: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Mensajes embed enviados desde el panel (edición/borrado en vivo).
 */
export const sentEmbeds = pgTable(
  "sent_embeds",
  {
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text().notNull(),
    messageId: text().notNull(),
    title: text(),
    /** JSON: EmbedPayload + components */
    embedData: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    action: text().notNull(),
    targetUserId: text(),
    targetChannelId: text(),
    moderatorId: text().notNull(),
    reason: text().notNull().default(""),
    meta: text(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_mod_logs_guild").on(table.guildId, table.createdAt)],
);

/**
 * Configuración de Action Logs por guild (canales, filtros, eventos).
 */
export const actionLogsConfig = pgTable("action_logs_config", {
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(false),
  /** GLOBAL | CATEGORY */
  routingMode: text().notNull().default("GLOBAL"),
  globalChannelId: text(),
  /** JSON: { messages, members, server, assets } */
  channelsMapping: text().notNull().default("{}"),
  /** JSON: string[] */
  ignoredChannels: text().notNull().default("[]"),
  /** JSON: string[] */
  ignoredRoles: text().notNull().default("[]"),
  ignoreBots: boolean().notNull().default(true),
  /** JSON: Record<eventKey, boolean> */
  enabledEvents: text().notNull().default("{}"),
  /** Días de retención del historial; 0 = sin límite. */
  dataRetentionDays: integer().notNull().default(14),
  /** JSON: { [channelId]: webhookId } */
  webhooksMapping: text().notNull().default("{}"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Historial de Action Logs capturados por discord.js.
 */
export const actionLogs = pgTable(
  "action_logs",
  {
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    category: text().notNull(),
    eventType: text().notNull(),
    executorId: text(),
    executorTag: text(),
    targetId: text(),
    targetTag: text(),
    channelId: text(),
    summary: text().notNull().default(""),
    /** JSON con detalles / diff */
    details: text().notNull().default("{}"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(false),
  /** JSON: AutoModFilters */
  filters: text().notNull().default("{}"),
  /** JSON: string[] */
  ignoredRoles: text().notNull().default("[]"),
  /** JSON: string[] */
  ignoredChannels: text().notNull().default("[]"),
  logChannelId: text(),
  /** Días para caducidad de Warns activos; 0 = nunca. */
  warnDecayDays: integer().notNull().default(30),
  /** Registrar warn en cada hit de filtro (default: sí, comportamiento histórico). */
  warnOnHit: boolean().notNull().default(true),
  /** DM al usuario junto al warn. Ignorado si warnOnHit es false. */
  dmOnHit: boolean().notNull().default(true),
  /** Saltar Administrator / ManageMessages. */
  skipStaff: boolean().notNull().default(false),
  /** JSON: AutoModPunishment[] */
  punishments: text().notNull().default("[]"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(false),
  /** JSON: AutoDeleteRule[] */
  rules: text().notNull().default("[]"),
  /** IANA timezone del cron SCHEDULED. */
  timezone: text().notNull().default("UTC"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AutoDeleteConfigRow = typeof autoDeleteConfig.$inferSelect;
export type NewAutoDeleteConfigRow = typeof autoDeleteConfig.$inferInsert;

/** COUNTDOWN pendiente: el leader borra al vencer delete_at. */
export const autoDeletePending = pgTable(
  "auto_delete_pending",
  {
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text().notNull(),
    messageId: text().notNull(),
    ruleChannelId: text().notNull(),
    deleteAt: timestamp({
      withTimezone: true,
      mode: "date",
    }).notNull(),
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(false),
  textXpMin: integer().notNull().default(15),
  textXpMax: integer().notNull().default(25),
  cooldownSeconds: integer().notNull().default(60),
  voiceEnabled: boolean().notNull().default(false),
  voiceXpPerMinute: integer().notNull().default(10),
  /** Multiplicador al transmitir pantalla (1.0 = sin bonus). */
  streamMultiplier: real().notNull().default(1),
  xpMultiplier: integer().notNull().default(1),
  /** JSON: string[] */
  ignoredRoles: text().notNull().default("[]"),
  /** JSON: string[] */
  ignoredChannels: text().notNull().default("[]"),
  levelUpChannelId: text(),
  /** JSON: LevelsRoleMultiplier[] */
  customMultipliers: text().notNull().default("[]"),
  /** JSON: LevelsChannelMultiplier[] */
  customChannelMultipliers: text().notNull().default("[]"),
  /** TEXT | EMBED | IMAGE */
  levelUpFormat: text().notNull().default("TEXT"),
  levelUpMessage: text()
    .notNull()
    .default("🎉 {user} reached **level {level}**!"),
  levelUpEmbedTitle: text().notNull().default("Level Up!"),
  levelUpEmbedColor: text().notNull().default("#34E21D"),
  levelUpShowThumbnail: boolean().notNull().default(true),
  levelUpImage: text(),
  liveLeaderboardChannelId: text(),
  liveLeaderboardMessageId: text(),
  leaderboardEmbedTitle: text().notNull().default("🏆 Leaderboard"),
  leaderboardEmbedDescription: text().notNull().default(""),
  leaderboardEmbedColor: text().notNull().default("#CA7AFF"),
  leaderboardShowThumbnail: boolean().notNull().default(false),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Recompensas de rol por nivel. Un rol por (guild, level). */
export const xpRewards = pgTable(
  "xp_rewards",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    level: integer().notNull(),
    roleId: text().notNull(),
  },
  (table) => [
    uniqueIndex("idx_xp_rewards_guild_level").on(table.guildId, table.level),
  ],
);

/** Progreso de XP por usuario en un guild. */
export const userXp = pgTable(
  "user_xp",
  {
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    xp: integer().notNull().default(0),
    level: integer().notNull().default(0),
    /** Si está en el futuro, el usuario no gana XP (Auto Mod XP_FREEZE). */
    xpFrozenUntil: timestamp({
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
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
  id: integer().primaryKey().generatedByDefaultAsIdentity(),
  guildId: text()
    .notNull()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  modalTitle: text().notNull().default("Form"),
  buttonLabel: text().notNull().default("Open form"),
  embedTitle: text().notNull().default("Server form"),
  embedDescription: text()
    .notNull()
    .default("Click the button to fill out the form."),
  embedColor: text().notNull().default("#5865F2"),
  embedImageUrl: text(),
  embedThumbnailUrl: text(),
  publishChannelId: text(),
  receptionChannelId: text(),
  /** JSON: FormQuestion[] */
  questions: text().notNull().default("[]"),
  cooldownMinutes: integer().notNull().default(0),
  enabled: boolean().notNull().default(true),
  /** cooldown | once */
  submitMode: text().notNull().default("cooldown"),
  /** JSON: snowflake[] */
  requiredRoleIds: text().notNull().default("[]"),
  /** JSON: snowflake[] */
  blockedRoleIds: text().notNull().default("[]"),
  pingRoleId: text(),
  thankYouMessage: text().notNull().default(""),
  acceptRoleId: text(),
  publishedChannelId: text(),
  publishedMessageId: text(),
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    formId: integer()
      .notNull()
      .references(() => guildForms.id, { onDelete: "cascade" }),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    username: text().notNull().default(""),
    displayName: text().notNull().default(""),
    avatarUrl: text(),
    /** JSON: FormAnswerEntry[] */
    answers: text().notNull().default("[]"),
    /** pending | accepted | rejected */
    status: text().notNull().default("pending"),
    reviewedBy: text(),
    reviewedAt: timestamp({ withTimezone: true, mode: "date" }),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  modalTitle: text().notNull().default("Form"),
  buttonLabel: text().notNull().default("Open form"),
  embedTitle: text().notNull().default("Server form"),
  embedDescription: text()
    .notNull()
    .default("Click the button to fill out the form."),
  embedColor: text().notNull().default("#5865F2"),
  publishChannelId: text(),
  receptionChannelId: text(),
  questions: text().notNull().default("[]"),
  publishedChannelId: text(),
  publishedMessageId: text(),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text().notNull(),
    /** IANA timezone, ej. America/Mexico_City */
    timezone: text().notNull().default("UTC"),
    /** JSON: ScheduledFrequency */
    frequency: text().notNull().default("{}"),
    /** JSON: ScheduledEmbedData */
    embedData: text().notNull().default("{}"),
    content: text().notNull().default(""),
    pingRoleId: text(),
    isActive: boolean().notNull().default(true),
    nextRunAt: timestamp({ withTimezone: true, mode: "date" }),
    lastSentAt: timestamp({ withTimezone: true, mode: "date" }),
    /** Lease del productor de cola (SKIP LOCKED). NULL = libre. */
    claimedUntil: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default("Custom command"),
    /** JSON: CustomCommandResponseData */
    responseData: text().notNull().default("{}"),
    /** JSON: CustomCommandOptions */
    options: text().notNull().default("{}"),
    /** JSON: CustomCommandPermissions */
    permissions: text().notNull().default("{}"),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    commandName: text().notNull(),
    enabled: boolean().notNull().default(true),
    /** JSON: string[] role IDs */
    allowedRoles: text().notNull().default("[]"),
    /** JSON: string[] channel IDs donde el comando no se puede usar */
    ignoredChannels: text().notNull().default("[]"),
    ephemeral: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.commandName] })],
);

export type DefaultCommandPermissionRow =
  typeof defaultCommandPermissions.$inferSelect;
export type NewDefaultCommandPermissionRow =
  typeof defaultCommandPermissions.$inferInsert;

/**
 * Configuración global de economía por guild.
 */
export const economyConfig = pgTable("economy_config", {
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  isActive: boolean().notNull().default(false),
  currencyName: text().notNull().default("Adobos Coins"),
  currencySymbol: text().notNull().default("🪙"),
  startBalance: integer().notNull().default(0),
  transferTax: integer().notNull().default(0),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    wallet: integer().notNull().default(0),
    bank: integer().notNull().default(0),
    /** Racha de /daily. */
    dailyStreak: integer().notNull().default(0),
    /** Última reclamación de /daily (ms). null = nunca. */
    lastDailyAt: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    /** Última reclamación de /weekly. */
    lastWeeklyAt: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    /** Última reclamación de /monthly. */
    lastMonthlyAt: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
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
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    bet: integer().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    /** Clave: `work` | `crime` | … */
    commandKey: text().notNull(),
    availableAt: timestamp({
      withTimezone: true,
      mode: "date",
    }).notNull(),
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  dailyPay: integer().notNull().default(100),
  weeklyPay: integer().notNull().default(500),
  monthlyPay: integer().notNull().default(2000),
  streakEnabled: boolean().notNull().default(false),
  streakBonusPercent: integer().notNull().default(5),
  /** EconomyRoleSalary[] */
  roleSalaries: text().notNull().default("[]"),
  /** EconomyJob[] */
  jobs: text().notNull().default("[]"),
  /** EconomyCrime[] */
  crimes: text().notNull().default("[]"),
  /** EconomyRobConfig JSON. */
  rob: text().notNull().default("{}"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    price: integer().notNull().default(0),
    icon: text().notNull().default("🛒"),
    /** null = infinito (almacenado como NULL). */
    stock: integer(),
    /** EconomyShopRewards JSON (Smart Toggles). */
    rewards: text().notNull().default("{}"),
    /** @deprecated Secuencia Shortcuts; se migra al leer. */
    actionSequence: text().default("[]"),
    /** @deprecated Legacy single-reward; se migra al leer. */
    rewardType: text(),
    /** @deprecated */
    rewardConfig: text().default("{}"),
    enabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    itemId: text().notNull(),
    itemName: text().notNull(),
    pricePaid: integer().notNull(),
    status: text().notNull().default("fulfilled"),
    metadata: text().notNull().default("{}"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    module: text().notNull(),
    multiplier: integer().notNull(),
    /** null = boost permanente. */
    expiresAt: timestamp({ withTimezone: true, mode: "date" }),
    purchaseId: text(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    roleId: text().notNull(),
    itemId: text(),
    purchaseId: text(),
    /** null = permanente. */
    expiresAt: timestamp({ withTimezone: true, mode: "date" }),
    /**
     * true = borrar el rol de Discord al expirar (creado por la tienda);
     * false = solo quitarlo del miembro (rol existente temporal).
     */
    deleteRoleOnExpire: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    channelId: text().notNull(),
    itemId: text(),
    purchaseId: text(),
    /** null = permanente. */
    expiresAt: timestamp({ withTimezone: true, mode: "date" }),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  isActive: boolean().notNull().default(false),
  minBet: integer().notNull().default(10),
  maxBet: integer().notNull().default(10_000),
  /** EconomyCasinoCoinflipConfig JSON. */
  coinflip: text().notNull().default("{}"),
  /** EconomyCasinoRouletteConfig JSON. */
  roulette: text().notNull().default("{}"),
  /** EconomyCasinoBlackjackConfig JSON. */
  blackjack: text().notNull().default("{}"),
  /** EconomyCasinoSlotsConfig JSON. */
  slots: text().notNull().default("{}"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type EconomyCasinoRow = typeof economyCasino.$inferSelect;
export type NewEconomyCasinoRow = typeof economyCasino.$inferInsert;

/** Usuarios del panel (OAuth Discord). */
export const panelUsers = pgTable("panel_users", {
  userId: text().primaryKey(),
  username: text().notNull(),
  globalName: text(),
  avatar: text(),
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Sesiones opacas del panel. */
export const panelSessions = pgTable(
  "panel_sessions",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => panelUsers.userId, { onDelete: "cascade" }),
    accessTokenEnc: text().notNull(),
    refreshTokenEnc: text(),
    accessExpiresAt: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp({
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_panel_sessions_user").on(table.userId)],
);

/** State OAuth de un solo uso (anti-CSRF + PKCE verifier). */
export const oauthStates = pgTable("oauth_states", {
  state: text().primaryKey(),
  codeVerifier: text().notNull(),
  expiresAt: timestamp({
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

/**
 * Usuario Discord ↔ customer de Stripe. El portal y checkout reutilizan este id.
 */
export const billingCustomers = pgTable("billing_customers", {
  userId: text().primaryKey(),
  // Nombre de constraint explícito: con `casing` drizzle-kit lo derivaría del
  // key JS (…stripeCustomerId_unique) y no del nombre de columna resuelto.
  stripeCustomerId: text()
    .notNull()
    .unique("billing_customers_stripe_customer_id_unique"),
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: text().notNull(),
    stripeCustomerId: text(),
    stripeSubscriptionId: text().unique(
      "subscriptions_stripe_subscription_id_unique",
    ),
    stripePriceId: text(),
    tier: text().notNull().default("pro"),
    /** active | trialing | past_due | paused | canceled | unpaid */
    status: text().notNull().default("active"),
    currentPeriodEnd: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    cancelAt: timestamp({ withTimezone: true, mode: "date" }),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    guildId: text().primaryKey(),
    subscriptionId: integer().references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    tier: text().notNull().default("free"),
    assignedAt: timestamp({ withTimezone: true, mode: "date" })
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
  eventId: text().primaryKey(),
  eventType: text().notNull(),
  processedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    hubChannelId: text().notNull(),
    categoryId: text(),
    nameTemplate: text().notNull().default("{user}'s room"),
    defaultUserLimit: integer().notNull().default(0),
    defaultBitrate: integer().notNull().default(0),
    autoText: boolean().notNull().default(false),
    enabled: boolean().notNull().default(true),
    /** JSON: VoiceRoomActionMap */
    allowedActions: text().notNull().default("{}"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    channelId: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    generatorId: integer()
      .notNull()
      .references(() => voiceRoomGenerators.id, { onDelete: "cascade" }),
    ownerId: text().notNull(),
    textChannelId: text(),
    locked: boolean().notNull().default(false),
    ghosted: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  timezone: text().notNull().default("UTC"),
  enabled: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Recordatorios personales pendientes. Se borran al disparar.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    userId: text().notNull(),
    channelId: text().notNull(),
    message: text().notNull(),
    dueAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    attempts: integer().notNull().default(0),
    /** Lease del productor de cola (SKIP LOCKED). NULL = libre. */
    claimedUntil: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  channelId: text(),
  /** JSON: string[] de claves unicode:/custom: */
  emojis: text().notNull().default('["unicode:⭐"]'),
  threshold: integer().notNull().default(3),
  enabled: boolean().notNull().default(false),
  allowSelfStar: boolean().notNull().default(false),
  allowBots: boolean().notNull().default(false),
  /** JSON: snowflake[] */
  ignoreChannelIds: text().notNull().default("[]"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Copia en el canal del tablón. original_message_id es el mensaje fuente.
 */
export const starboardPosts = pgTable(
  "starboard_posts",
  {
    originalMessageId: text().primaryKey(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text().notNull(),
    starboardMessageId: text().notNull(),
    starCount: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(false),
  alertChannelId: text(),
  joinFloodEnabled: boolean().notNull().default(true),
  joinCount: integer().notNull().default(10),
  joinWindowSeconds: integer().notNull().default(10),
  joinAction: text().notNull().default("kick"),
  accountAgeEnabled: boolean().notNull().default(false),
  accountAgeDays: integer().notNull().default(7),
  accountAgeAction: text().notNull().default("kick"),
  lockdownJoinAction: text().notNull().default("timeout"),
  timeoutSeconds: integer().notNull().default(3600),
  whitelistRoleIds: text().notNull().default("[]"),
  nukeEnabled: boolean().notNull().default(false),
  nukeWindowSeconds: integer().notNull().default(10),
  nukePunishment: text().notNull().default("strip"),
  nukeThresholds: text().notNull().default("{}"),
  nukeWhitelistUserIds: text().notNull().default("[]"),
  nukeWhitelistRoleIds: text().notNull().default("[]"),
  lockdownActive: boolean().notNull().default(false),
  lockdownStartedAt: timestamp({
    withTimezone: true,
    mode: "date",
  }),
  lockdownByUserId: text(),
  lockdownSnapshot: text().notNull().default("[]"),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    platform: text().notNull(),
    handle: text().notNull(),
    displayName: text().notNull(),
    discordChannelId: text().notNull(),
    mentionRoleId: text(),
    template: text().notNull().default("{name} is live: {title}\n{url}"),
    enabled: boolean().notNull().default(true),
    isLive: boolean().notNull().default(false),
    liveId: text(),
    lastTitle: text(),
    lastCheckedAt: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    lastLiveAt: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
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
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    trigger: text().notNull(),
    matchMode: text().notNull().default("contains"),
    response: text().notNull(),
    enabled: boolean().notNull().default(true),
    caseSensitive: boolean().notNull().default(false),
    wholeWord: boolean().notNull().default(false),
    useReply: boolean().notNull().default(true),
    cooldownSeconds: integer().notNull().default(0),
    allowedChannelIds: text().notNull().default("[]"),
    ignoredChannelIds: text().notNull().default("[]"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_auto_replies_guild").on(table.guildId)],
);

export type AutoReplyRow = typeof autoReplies.$inferSelect;

/**
 * Tickets: ajustes por guild. El canal de Discord es la sala; Postgres es el expediente.
 */
export const ticketSettings = pgTable("ticket_settings", {
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  categoryId: text(),
  staffRoleIds: text().notNull().default("[]"),
  nameTemplate: text().notNull().default("ticket-{n}-{user}"),
  maxOpenPerUser: integer().notNull().default(1),
  logChannelId: text(),
  nextNumber: integer().notNull().default(1),
  openerCanClose: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type TicketSettingsRow = typeof ticketSettings.$inferSelect;

/** Panel publicado (mensaje + hasta 5 botones / tipos). */
export const ticketPanels = pgTable(
  "ticket_panels",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text(),
    messageId: text(),
    embedTitle: text().notNull().default("Tickets"),
    embedDescription: text()
      .notNull()
      .default("Press a button to open a ticket."),
    embedColor: text().notNull().default("#5865F2"),
    buttons: text().notNull().default("[]"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_ticket_panels_guild").on(table.guildId)],
);

export type TicketPanelRow = typeof ticketPanels.$inferSelect;

/** Caso de ticket. channel_id null si el canal ya no existe. */
export const tickets = pgTable(
  "tickets",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    number: integer().notNull(),
    openerId: text().notNull(),
    channelId: text(),
    typeKey: text().notNull(),
    status: text().notNull().default("open"),
    claimedBy: text(),
    reason: text(),
    closeReason: text(),
    transcriptText: text(),
    openedAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    closedAt: timestamp({ withTimezone: true, mode: "date" }),
    claimedAt: timestamp({ withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("tickets_guild_number").on(table.guildId, table.number),
    uniqueIndex("tickets_channel_id_unique").on(table.channelId),
    index("idx_tickets_guild_status").on(table.guildId, table.status),
    index("idx_tickets_guild_opener").on(table.guildId, table.openerId),
  ],
);

export type TicketRow = typeof tickets.$inferSelect;

/** Timeline append-only. Nunca update/delete de filas. */
export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    ticketId: integer()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    type: text().notNull(),
    actorId: text(),
    payload: text().notNull().default("{}"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_ticket_events_ticket").on(table.ticketId),
    index("idx_ticket_events_guild_created").on(table.guildId, table.createdAt),
  ],
);

export type TicketEventRow = typeof ticketEvents.$inferSelect;

export const ticketParticipants = pgTable(
  "ticket_participants",
  {
    ticketId: integer()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: text().notNull(),
    kind: text().notNull().default("added"),
  },
  (table) => [
    primaryKey({ columns: [table.ticketId, table.userId] }),
    index("idx_ticket_participants_ticket").on(table.ticketId),
  ],
);

export type TicketParticipantRow = typeof ticketParticipants.$inferSelect;

/**
 * Giveaways: ajustes por guild. La urna es Postgres; el mensaje es el anuncio.
 */
export const giveawaySettings = pgTable("giveaway_settings", {
  guildId: text()
    .primaryKey()
    .references(() => guildSettings.guildId, { onDelete: "cascade" }),
  managerRoleIds: text().notNull().default("[]"),
  dmWinners: boolean().notNull().default(true),
  pingRoleId: text(),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type GiveawaySettingsRow = typeof giveawaySettings.$inferSelect;

export const giveaways = pgTable(
  "giveaways",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    guildId: text()
      .notNull()
      .references(() => guildSettings.guildId, { onDelete: "cascade" }),
    channelId: text().notNull(),
    messageId: text(),
    prize: text().notNull(),
    description: text().notNull().default(""),
    winnerCount: integer().notNull().default(1),
    status: text().notNull().default("scheduled"),
    startsAt: timestamp({
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp({
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endedAt: timestamp({ withTimezone: true, mode: "date" }),
    /** Lease del productor de cola (SKIP LOCKED). NULL = libre. */
    claimedUntil: timestamp({
      withTimezone: true,
      mode: "date",
    }),
    createdBy: text().notNull(),
    requiredRoleIds: text().notNull().default("[]"),
    blockedRoleIds: text().notNull().default("[]"),
    minGuildAgeDays: integer().notNull().default(0),
    minAccountAgeDays: integer().notNull().default(0),
    winnerIds: text().notNull().default("[]"),
    pastWinnerIds: text().notNull().default("[]"),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_giveaways_guild_status").on(table.guildId, table.status),
    index("idx_giveaways_ends_at").on(table.endsAt),
    index("idx_giveaways_starts_at").on(table.startsAt),
  ],
);

export type GiveawayRow = typeof giveaways.$inferSelect;

export const giveawayEntries = pgTable(
  "giveaway_entries",
  {
    giveawayId: integer()
      .notNull()
      .references(() => giveaways.id, { onDelete: "cascade" }),
    userId: text().notNull(),
    enteredAt: timestamp({ withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.giveawayId, table.userId] }),
    index("idx_giveaway_entries_giveaway").on(table.giveawayId),
  ],
);

export type GiveawayEntryRow = typeof giveawayEntries.$inferSelect;

/** Valores semilla útiles en migraciones / seeds. */
export const DEFAULT_PLUGIN_NAMES = [
  "minecraft",
  "osu",
  "valorant",
  "gachas",
  "alerts",
] as const;
