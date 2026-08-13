import type { EmbedPayload, MessageButtonStyle } from "./messages.js";

export type AutoRoleMode = "buttons" | "reactions";
export type MessageSourceMode = "existing" | "create" | "template";

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

/** Fila unificada UI: rol + etiqueta + emoji opcional. */
export interface InteractiveRoleMappingInput {
  roleId: string;
  label: string;
  emojiKey?: string;
  style?: Exclude<MessageButtonStyle, "Link">;
}

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
}

export interface CreateAutoRoleResponse {
  ok: true;
  messageId: string;
  channelId: string;
  saved: number;
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
