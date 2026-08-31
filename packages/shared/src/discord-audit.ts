/** Tipos del espejo de Audit Log nativo de Discord (solo lectura). */

export type DiscordAuditCategory =
  | "all"
  | "members"
  | "channels"
  | "roles"
  | "server";

/** Filtro UI por tono de acción. */
export type DiscordAuditToneFilter = "all" | "create" | "update" | "delete";

/** Filtro UI por entidad afectada. */
export type DiscordAuditEntityFilter =
  | "all"
  | "users"
  | "channels"
  | "roles"
  | "server"
  | "emojis"
  | "webhooks";

export type DiscordAuditTone = "create" | "update" | "delete" | "neutral";

export type DiscordAuditTargetKind =
  | "user"
  | "channel"
  | "role"
  | "guild"
  | "emoji"
  | "sticker"
  | "invite"
  | "webhook"
  | "message"
  | "integration"
  | "unknown";

export interface DiscordAuditExecutor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DiscordAuditTarget {
  id: string | null;
  kind: DiscordAuditTargetKind;
  label: string;
}

export interface DiscordAuditChangeItem {
  key: string;
  summary: string;
  oldValue?: string;
  newValue?: string;
}

/** Clasificación tras consolidar MemberRoleUpdate. */
export type DiscordAuditRoleKind = "ROLE_ADD" | "ROLE_REMOVE" | "ROLE_UPDATE";

/** Rol resuelto desde caché de Discord (audit $add / $remove). */
export interface DiscordAuditRoleRef {
  id: string;
  name: string;
  /** hexColor de discord.js (p. ej. `#ff0000`); `#000000` si no tiene color. */
  color: string;
}

export interface DiscordAuditEntry {
  id: string;
  createdAt: string;
  action: number;
  actionKey: string;
  actionLabel: string;
  category: Exclude<DiscordAuditCategory, "all">;
  tone: DiscordAuditTone;
  executor: DiscordAuditExecutor | null;
  target: DiscordAuditTarget;
  reason: string | null;
  changes: DiscordAuditChangeItem[];
  /** Resumen plano (compat / búsqueda). */
  changesSummary: string;
  /** Presente en eventos de roles (individuales o consolidados). */
  roleKind?: DiscordAuditRoleKind;
  addedRoles?: DiscordAuditRoleRef[];
  removedRoles?: DiscordAuditRoleRef[];
  /** IDs de entradas crudas fusionadas. */
  sourceIds?: string[];
  consolidatedCount?: number;
}

export interface DiscordAuditLogQuery {
  guildId?: string;
  limit?: number;
  /** Ejecutor (Snowflake) — se pasa a Discord fetchAuditLogs.user */
  userId?: string;
  /** AuditLogEvent numérico — se pasa a Discord fetchAuditLogs.type */
  actionType?: number;
}

export interface DiscordAuditLogResponse {
  entries: DiscordAuditEntry[];
  fetchedAt: string;
}
