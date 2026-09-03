import type { NonThreadGuildBasedChannel } from "discord.js";
import { logger } from "#core/log.js";
import { onGuildAuditLogEntryCreate } from "./audit.js";
import {
  passesActionLogFilters,
  recordActionLog,
} from "./domain/action-logs.js";
import {
  onEmojiCreate,
  onEmojiDelete,
  onEmojiUpdate,
  onStickerCreate,
  onStickerDelete,
  onStickerUpdate,
} from "./gateway/assets.js";
import { onInviteCreate, onInviteDelete } from "./gateway/invites.js";
import {
  onGuildBanAdd,
  onGuildBanRemove,
  onGuildMemberAdd,
  onGuildMemberRemove,
  onGuildMemberUpdate,
} from "./gateway/members.js";
import {
  onMessageDelete,
  onMessageDeleteBulk,
  onMessageUpdate,
} from "./gateway/messages.js";
import {
  onChannelCreate,
  onChannelDelete,
  onChannelUpdate,
  onGuildUpdate,
  onRoleCreate,
  onRoleDelete,
  onRoleUpdate,
} from "./gateway/server.js";
import {
  onThreadCreate,
  onThreadDelete,
  onThreadUpdate,
} from "./gateway/threads.js";
import { onVoiceStateUpdate } from "./gateway/voice.js";

/** Registra todos los listeners de Action Logs en el ModuleContext. */
export function registerActionLogListeners(ctx: {
  on: <K extends keyof import("discord.js").ClientEvents>(
    event: K,
    handler: (...args: import("discord.js").ClientEvents[K]) => void,
  ) => void;
}): void {
  ctx.on("guildAuditLogEntryCreate", (entry, guild) => {
    void onGuildAuditLogEntryCreate(entry, guild);
  });
  ctx.on("messageDelete", (message) => {
    void onMessageDelete(message);
  });
  ctx.on("messageUpdate", (oldMessage, newMessage) => {
    void onMessageUpdate(oldMessage, newMessage);
  });
  ctx.on("messageDeleteBulk", (messages) => {
    void onMessageDeleteBulk(messages);
  });
  ctx.on("guildMemberAdd", (member) => {
    void onGuildMemberAdd(member);
  });
  ctx.on("guildMemberRemove", (member) => {
    void onGuildMemberRemove(member);
  });
  ctx.on("guildMemberUpdate", (oldMember, newMember) => {
    void onGuildMemberUpdate(oldMember, newMember);
  });
  ctx.on("guildBanAdd", (ban) => {
    void onGuildBanAdd(ban);
  });
  ctx.on("guildBanRemove", (ban) => {
    void onGuildBanRemove(ban);
  });
  ctx.on("roleCreate", (role) => {
    void onRoleCreate(role);
  });
  ctx.on("roleDelete", (role) => {
    void onRoleDelete(role);
  });
  ctx.on("roleUpdate", (oldRole, newRole) => {
    void onRoleUpdate(oldRole, newRole);
  });
  ctx.on("channelCreate", (channel) => {
    if (
      "isThread" in channel &&
      typeof channel.isThread === "function" &&
      channel.isThread()
    ) {
      return;
    }
    if ("guild" in channel && channel.guild) {
      void onChannelCreate(channel as NonThreadGuildBasedChannel);
    }
  });
  ctx.on("channelDelete", (channel) => {
    void onChannelDelete(channel as NonThreadGuildBasedChannel);
  });
  ctx.on("channelUpdate", (oldChannel, newChannel) => {
    void onChannelUpdate(
      oldChannel as NonThreadGuildBasedChannel,
      newChannel as NonThreadGuildBasedChannel,
    );
  });
  ctx.on("threadCreate", (thread) => {
    void onThreadCreate(thread);
  });
  ctx.on("threadDelete", (thread) => {
    void onThreadDelete(thread);
  });
  ctx.on("threadUpdate", (oldThread, newThread) => {
    void onThreadUpdate(oldThread, newThread);
  });
  ctx.on("guildUpdate", (oldGuild, newGuild) => {
    void onGuildUpdate(oldGuild, newGuild);
  });
  ctx.on("emojiCreate", (emoji) => {
    void onEmojiCreate(emoji);
  });
  ctx.on("emojiDelete", (emoji) => {
    void onEmojiDelete(emoji);
  });
  ctx.on("emojiUpdate", (oldEmoji, newEmoji) => {
    void onEmojiUpdate(oldEmoji, newEmoji);
  });
  ctx.on("stickerCreate", (sticker) => {
    void onStickerCreate(sticker);
  });
  ctx.on("stickerDelete", (sticker) => {
    void onStickerDelete(sticker);
  });
  ctx.on("stickerUpdate", (oldSticker, newSticker) => {
    void onStickerUpdate(oldSticker, newSticker);
  });
  ctx.on("voiceStateUpdate", (oldState, newState) => {
    void onVoiceStateUpdate(oldState, newState).catch((err) => {
      logger.warn({ err: err }, "voiceStateUpdate listener:");
    });
  });
  ctx.on("inviteCreate", (invite) => {
    void onInviteCreate(invite);
  });
  ctx.on("inviteDelete", (invite) => {
    void onInviteDelete(invite);
  });

  const onAny = ctx.on as (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
  onAny("guildSoundboardSoundCreate", async (sound) => {
    const s = sound as {
      guildId?: string | null;
      guild?: { id: string };
      client: import("discord.js").Client;
      name?: string;
      id: string;
    };
    const guildId = s.guildId ?? s.guild?.id;
    if (!guildId) return;
    if (!(await passesActionLogFilters(guildId, "soundboardCreate"))) return;
    void recordActionLog(s.client, {
      guildId,
      eventKey: "soundboardCreate",
      targetId: s.id,
      targetTag: s.name ?? s.id,
      summary: `Sound created: ${s.name ?? s.id}`,
      details: { name: s.name ?? null },
      actorIsBot: false,
    });
  });
  onAny("guildSoundboardSoundDelete", async (sound) => {
    const s = sound as {
      guildId?: string | null;
      guild?: { id: string };
      client: import("discord.js").Client;
      name?: string;
      id: string;
    };
    const guildId = s.guildId ?? s.guild?.id;
    if (!guildId) return;
    if (!(await passesActionLogFilters(guildId, "soundboardDelete"))) return;
    void recordActionLog(s.client, {
      guildId,
      eventKey: "soundboardDelete",
      targetId: s.id,
      targetTag: s.name ?? s.id,
      summary: `Sonido eliminado: ${s.name ?? s.id}`,
      details: { name: s.name ?? null },
      actorIsBot: false,
    });
  });
  onAny("guildSoundboardSoundUpdate", async (_oldSound, sound) => {
    const s = sound as {
      guildId?: string | null;
      guild?: { id: string };
      client: import("discord.js").Client;
      name?: string;
      id: string;
    };
    const guildId = s.guildId ?? s.guild?.id;
    if (!guildId) return;
    if (!(await passesActionLogFilters(guildId, "soundboardUpdate"))) return;
    void recordActionLog(s.client, {
      guildId,
      eventKey: "soundboardUpdate",
      targetId: s.id,
      targetTag: s.name ?? s.id,
      summary: `Sonido actualizado: ${s.name ?? s.id}`,
      details: { name: s.name ?? null },
      actorIsBot: false,
    });
  });
}
