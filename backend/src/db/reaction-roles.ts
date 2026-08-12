import { and, eq } from "drizzle-orm";
import type { EmojiIdentifierResolvable } from "discord.js";
import { getDb } from "./client.js";
import { reactionRoles, type ReactionRole } from "./schema.js";

/** Normaliza un emoji de reacción a la clave usada en SQLite. */
export function toEmojiKey(emoji: {
  id: string | null;
  name: string | null;
}): string | null {
  if (emoji.id) return `custom:${emoji.id}`;
  if (emoji.name) return `unicode:${emoji.name}`;
  return null;
}

/** Convierte emojiKey de vuelta a algo usable en message.react(). */
export function emojiKeyToResolvable(emojiKey: string): EmojiIdentifierResolvable | null {
  if (emojiKey.startsWith("custom:")) {
    return emojiKey.slice("custom:".length);
  }
  if (emojiKey.startsWith("unicode:")) {
    return emojiKey.slice("unicode:".length);
  }
  return null;
}

export function findReactionRole(
  messageId: string,
  emojiKey: string,
): ReactionRole | undefined {
  const db = getDb();
  return (
    db
      .select()
      .from(reactionRoles)
      .where(
        and(
          eq(reactionRoles.messageId, messageId),
          eq(reactionRoles.emojiKey, emojiKey),
        ),
      )
      .get() ?? undefined
  );
}

export function listReactionRolesForMessage(messageId: string): ReactionRole[] {
  const db = getDb();
  return db
    .select()
    .from(reactionRoles)
    .where(eq(reactionRoles.messageId, messageId))
    .all();
}

export interface UpsertReactionRoleInput {
  guildId: string;
  channelId: string;
  messageId: string;
  emojiKey: string;
  roleId: string;
}

export function upsertReactionRoles(
  entries: UpsertReactionRoleInput[],
): void {
  const db = getDb();

  for (const entry of entries) {
    db.insert(reactionRoles)
      .values({
        guildId: entry.guildId,
        channelId: entry.channelId,
        messageId: entry.messageId,
        emojiKey: entry.emojiKey,
        roleId: entry.roleId,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [reactionRoles.messageId, reactionRoles.emojiKey],
        set: {
          guildId: entry.guildId,
          channelId: entry.channelId,
          roleId: entry.roleId,
        },
      })
      .run();
  }
}

export function deleteReactionRolesForMessage(messageId: string): void {
  const db = getDb();
  db.delete(reactionRoles).where(eq(reactionRoles.messageId, messageId)).run();
}
