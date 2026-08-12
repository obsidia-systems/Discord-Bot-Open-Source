import type { EmbedPayload, MessageButtonStyle } from "./messages.js";

export type AutoRoleMode = "buttons" | "reactions";
export type MessageSourceMode = "existing" | "create";

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
  messageSource: MessageSourceMode;
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
