import type { EmbedPayload, MessageButtonStyle } from "./messages.js";

export type AutoRoleMode = "buttons" | "reactions";
export type MessageSourceMode = "existing" | "create" | "template" | "plain";

export type AutoroleRegistryType = "BUTTONS" | "SELECT" | "REACTIONS";
export type AutoroleCreateSource = "template" | "existing" | "plain";

export interface ReactionRoleMappingInput {
  /** `custom:<emojiId>` o `unicode:<char>` */
  emojiKey: string;
  roleId: string;
}

export interface ButtonRoleMappingInput {
  roleId: string;
  label: string;
  style: Exclude<MessageButtonStyle, "Link">;
  customId: string;
  /** Opcional: `custom:<id>` o `unicode:<char>` */
  emojiKey?: string;
}

/** Fila unificada UI / registry JSON. */
export interface AutoroleMappingItem {
  id?: string;
  roleId: string;
  label: string;
  emojiKey?: string;
  style?: Exclude<MessageButtonStyle, "Link">;
}

/** @deprecated alias */
export type InteractiveRoleMappingInput = AutoroleMappingItem;

export interface SaveReactionRolesRequest {
  guildId: string;
  channelId: string;
  messageId: string;
  mappings: ReactionRoleMappingInput[];
}

export interface SaveReactionRolesResponse {
  ok: true;
  saved: number;
}

export interface CreateAutoRoleRequest {
  mode: AutoRoleMode;
  guildId: string;
  channelId: string;
  messageSource: "existing" | "create";
  messageId?: string;
  embed?: EmbedPayload;
  reactionMappings?: ReactionRoleMappingInput[];
  buttonMappings?: ButtonRoleMappingInput[];
  /** Nombre en el registro del dashboard. */
  title?: string;
}

export interface CreateAutoRoleResponse {
  ok: true;
  messageId: string;
  channelId: string;
  saved: number;
  registryId?: number;
}

/** Payload compacto del asistente (plantilla / existente / texto plano). */
export interface CreateAutoroleCompactRequest {
  guildId: string;
  channelId: string;
  type: AutoroleRegistryType;
  source: AutoroleCreateSource;
  title?: string;
  /** Plantilla de embed. */
  templateId?: number;
  /** Mensaje existente. */
  messageId?: string;
  /** Texto plano (sin embed). */
  plainContent?: string;
  mappings: AutoroleMappingItem[];
}

export interface AutoroleRegistryEntry {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  type: AutoroleRegistryType;
  rolesMapping: AutoroleMappingItem[];
  createdAt: string;
  /** Canal resuelto para UI (opcional). */
  channelName?: string | null;
  orphaned?: boolean;
  /**
   * true si el mensaje en Discord fue enviado por el bot.
   * null si no se pudo verificar (mensaje borrado / sin acceso).
   */
  isBotAuthor?: boolean | null;
}

export interface ListActiveAutorolesResponse {
  entries: AutoroleRegistryEntry[];
}

export interface UpdateAutoroleMappingRequest {
  mappings: AutoroleMappingItem[];
}

export interface UpdateAutoroleMappingResponse {
  ok: true;
  entry: AutoroleRegistryEntry;
  orphaned?: boolean;
}

export interface UpdateAutoroleContentRequest {
  content?: string;
  embed?: EmbedPayload;
  title?: string;
}

export interface UpdateAutoroleContentResponse {
  ok: true;
  entry: AutoroleRegistryEntry;
  orphaned?: boolean;
}

export interface DeleteAutoroleResponse {
  ok: true;
  deletedId: number;
  /** true si el mensaje ya no existía en Discord (10008). */
  orphaned?: boolean;
}

/** Roles asignados al unirse al servidor. */
export interface AutoJoinRolesConfig {
  guildId: string;
  humanRoles: string[];
  botRoles: string[];
  updatedAt?: string;
}

export interface SaveAutoJoinRolesRequest {
  guildId?: string;
  humanRoles: string[];
  botRoles: string[];
}

export interface SaveAutoJoinRolesResponse {
  ok: true;
  config: AutoJoinRolesConfig;
}

export interface GetAutoJoinRolesResponse {
  config: AutoJoinRolesConfig;
}

/** Alias del payload interactivo (POST /api/roles/interactive). */
export type SaveInteractiveRolesRequest = CreateAutoRoleRequest;
export type SaveInteractiveRolesResponse = CreateAutoRoleResponse;
