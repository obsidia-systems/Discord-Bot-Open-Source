import type {
  ActionLogCategory,
  ActionLogEventKey,
  ActionLogEventType,
} from "@adobos/shared";

export const CATEGORY_LABELS: Record<ActionLogCategory, string> = {
  MESSAGES: "Mensajes",
  MEMBERS: "Miembros",
  ROLES: "Roles",
  CHANNELS: "Canales",
  ASSETS: "Recursos",
};

export function categoryBadgeClass(category: ActionLogCategory): string {
  switch (category) {
    case "MESSAGES":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "MEMBERS":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "ROLES":
    case "CHANNELS":
      return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "ASSETS":
      return "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400";
    default:
      return "border-border bg-secondary text-secondary-foreground";
  }
}

export const EVENT_TYPE_LABELS: Record<ActionLogEventType, string> = {
  MESSAGE_DELETE: "Eliminado",
  MESSAGE_UPDATE: "Editado",
  MESSAGE_ATTACHMENT_DELETE: "Adjunto",
  MEMBER_JOIN: "Join",
  MEMBER_LEAVE: "Leave",
  MEMBER_ROLE_UPDATE: "Roles",
  MEMBER_NICKNAME_UPDATE: "Apodo",
  MEMBER_BAN: "Ban",
  MEMBER_UNBAN: "Unban",
  ROLE_CREATE: "Rol +",
  ROLE_DELETE: "Rol −",
  ROLE_UPDATE: "Rol ~",
  CHANNEL_CREATE: "Canal +",
  CHANNEL_DELETE: "Canal −",
  CHANNEL_UPDATE: "Canal ~",
  EMOJI_CREATE: "Emoji +",
  EMOJI_DELETE: "Emoji −",
  EMOJI_UPDATE: "Emoji ~",
  STICKER_CREATE: "Sticker +",
  STICKER_DELETE: "Sticker −",
  STICKER_UPDATE: "Sticker ~",
  SOUNDBOARD_CREATE: "Sonido +",
  SOUNDBOARD_DELETE: "Sonido −",
  SOUNDBOARD_UPDATE: "Sonido ~",
};

export interface EventSwitchDef {
  key: ActionLogEventKey;
  label: string;
}

export const EVENT_ACCORDION_GROUPS: Array<{
  id: string;
  title: string;
  events: EventSwitchDef[];
}> = [
  {
    id: "messages",
    title: "Mensajes",
    events: [
      { key: "messageDelete", label: "Mensaje eliminado" },
      { key: "messageUpdate", label: "Mensaje editado" },
      { key: "messageAttachmentDelete", label: "Imágenes / adjuntos eliminados" },
    ],
  },
  {
    id: "members",
    title: "Miembros",
    events: [
      { key: "memberJoin", label: "Miembro se une" },
      { key: "memberLeave", label: "Miembro sale" },
      { key: "memberRoleUpdate", label: "Rol añadido / quitado" },
      { key: "memberNicknameUpdate", label: "Apodo cambiado" },
      { key: "memberBan", label: "Ban" },
      { key: "memberUnban", label: "Unban" },
    ],
  },
  {
    id: "server",
    title: "Roles y canales",
    events: [
      { key: "roleCreate", label: "Creación de roles" },
      { key: "roleDelete", label: "Eliminación de roles" },
      { key: "roleUpdate", label: "Actualización de roles" },
      { key: "channelCreate", label: "Creación de canales" },
      { key: "channelDelete", label: "Eliminación de canales" },
      { key: "channelUpdate", label: "Actualización de canales" },
    ],
  },
  {
    id: "assets",
    title: "Recursos del servidor",
    events: [
      { key: "emojiCreate", label: "Emojis (creación)" },
      { key: "emojiDelete", label: "Emojis (borrado)" },
      { key: "emojiUpdate", label: "Emojis (edición)" },
      { key: "stickerCreate", label: "Stickers (creación)" },
      { key: "stickerDelete", label: "Stickers (borrado)" },
      { key: "stickerUpdate", label: "Stickers (edición)" },
      { key: "soundboardCreate", label: "Efectos de sonido (creación)" },
      { key: "soundboardDelete", label: "Efectos de sonido (borrado)" },
      { key: "soundboardUpdate", label: "Efectos de sonido (edición)" },
    ],
  },
];
