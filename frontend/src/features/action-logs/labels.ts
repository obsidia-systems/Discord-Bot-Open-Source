import type {
  ActionLogCategory,
  ActionLogEventKey,
  ActionLogEventType,
} from "@adobos/shared";
import { ACTION_LOG_EVENT_KEYS } from "@adobos/shared";

export const CATEGORY_LABELS: Record<ActionLogCategory, string> = {
  MESSAGES: "Messages",
  MEMBERS: "Members",
  ROLES: "Roles",
  CHANNELS: "Channels",
  ASSETS: "Assets",
  VOICE: "Voice",
  INVITES: "Invites",
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
    case "VOICE":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400";
    case "INVITES":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "border-border bg-secondary text-secondary-foreground";
  }
}

export const EVENT_TYPE_LABELS: Record<ActionLogEventType, string> = {
  MESSAGE_DELETE: "Deleted",
  MESSAGE_UPDATE: "Edited",
  MESSAGE_ATTACHMENT_DELETE: "Attachment",
  MESSAGE_DELETE_BULK: "Purge",
  MEMBER_JOIN: "Join",
  MEMBER_LEAVE: "Leave",
  MEMBER_KICK: "Kick",
  MEMBER_ROLE_UPDATE: "Roles",
  MEMBER_NICKNAME_UPDATE: "Nickname",
  MEMBER_TIMEOUT: "Timeout",
  MEMBER_UNTIMEOUT: "Timeout −",
  MEMBER_BAN: "Ban",
  MEMBER_UNBAN: "Unban",
  ROLE_CREATE: "Role +",
  ROLE_DELETE: "Role −",
  ROLE_UPDATE: "Role ~",
  CHANNEL_CREATE: "Channel +",
  CHANNEL_DELETE: "Channel −",
  CHANNEL_UPDATE: "Channel ~",
  THREAD_CREATE: "Thread +",
  THREAD_DELETE: "Thread −",
  THREAD_UPDATE: "Thread ~",
  GUILD_UPDATE: "Server",
  EMOJI_CREATE: "Emoji +",
  EMOJI_DELETE: "Emoji −",
  EMOJI_UPDATE: "Emoji ~",
  STICKER_CREATE: "Sticker +",
  STICKER_DELETE: "Sticker −",
  STICKER_UPDATE: "Sticker ~",
  SOUNDBOARD_CREATE: "Sound +",
  SOUNDBOARD_DELETE: "Sound −",
  SOUNDBOARD_UPDATE: "Sound ~",
  VOICE_JOIN: "Voice +",
  VOICE_LEAVE: "Voice −",
  VOICE_KICK: "Voice kick",
  VOICE_MOVE: "Voice ~",
  INVITE_CREATE: "Invite +",
  INVITE_DELETE: "Invite −",
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
    title: "Messages",
    events: [
      { key: "messageDelete", label: "Message deleted" },
      { key: "messageUpdate", label: "Message edited" },
      { key: "messageAttachmentDelete", label: "Images / attachments deleted" },
      { key: "messageDeleteBulk", label: "Bulk deletion (purge)" },
    ],
  },
  {
    id: "members",
    title: "Members",
    events: [
      { key: "memberJoin", label: "Member joins" },
      { key: "memberLeave", label: "Member leaves" },
      { key: "memberKick", label: "Kick" },
      { key: "memberRoleUpdate", label: "Role added / removed" },
      { key: "memberNicknameUpdate", label: "Nickname changed" },
      { key: "memberTimeout", label: "Timeout" },
      { key: "memberUntimeout", label: "Timeout lifted" },
      { key: "memberBan", label: "Ban" },
      { key: "memberUnban", label: "Unban" },
    ],
  },
  {
    id: "server",
    title: "Roles and channels",
    events: [
      { key: "roleCreate", label: "Role creation" },
      { key: "roleDelete", label: "Role deletion" },
      { key: "roleUpdate", label: "Role update" },
      { key: "channelCreate", label: "Channel creation" },
      { key: "channelDelete", label: "Channel deletion" },
      { key: "channelUpdate", label: "Channel update" },
      { key: "threadCreate", label: "Thread created" },
      { key: "threadDelete", label: "Thread deleted" },
      { key: "threadUpdate", label: "Thread updated (name / archive)" },
      { key: "guildUpdate", label: "Server (name, icon, vanity)" },
    ],
  },
  {
    id: "voice",
    title: "Voice",
    events: [
      { key: "voiceJoin", label: "Joined a voice channel" },
      { key: "voiceLeave", label: "Voluntary leave" },
      { key: "voiceKick", label: "Kick / forced disconnect" },
      { key: "voiceMove", label: "Moved between channels" },
    ],
  },
  {
    id: "invites",
    title: "Invites",
    events: [
      { key: "inviteCreate", label: "Invite created" },
      { key: "inviteDelete", label: "Invite deleted" },
    ],
  },
  {
    id: "assets",
    title: "Server assets",
    events: [
      { key: "emojiCreate", label: "Emoji (creation)" },
      { key: "emojiDelete", label: "Emoji (deletion)" },
      { key: "emojiUpdate", label: "Emoji (edit)" },
      { key: "stickerCreate", label: "Stickers (creation)" },
      { key: "stickerDelete", label: "Stickers (deletion)" },
      { key: "stickerUpdate", label: "Stickers (edit)" },
      { key: "soundboardCreate", label: "Sound effects (creation)" },
      { key: "soundboardDelete", label: "Sound effects (deletion)" },
      { key: "soundboardUpdate", label: "Sound effects (edit)" },
    ],
  },
];

export const TOTAL_EVENT_COUNT = ACTION_LOG_EVENT_KEYS.length;
