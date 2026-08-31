import { and, eq } from "drizzle-orm";
import type { EmojiIdentifierResolvable } from "discord.js";
import { getDb, one } from "./client.js";
import { reactionRoles, type ReactionRole } from "./schema.js";

/** Normaliza un emoji de reacción a la clave usada en la tabla. */
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

export async function findReactionRole(
  messageId: string,
  emojiKey: string,
): Promise<ReactionRole | undefined> {
  return one(
    getDb()
      .select()
      .from(reactionRoles)
      .where(
        and(
          eq(reactionRoles.messageId, messageId),
          eq(reactionRoles.emojiKey, emojiKey),
        ),
      )
      .limit(1),
  );
}

export async function listReactionRolesForMessage(
  messageId: string,
): Promise<ReactionRole[]> {
  return getDb()
    .select()
    .from(reactionRoles)
    .where(eq(reactionRoles.messageId, messageId));
}

export interface UpsertReactionRoleInput {
  guildId: string;
  channelId: string;
  messageId: string;
  emojiKey: string;
  roleId: string;
}

export async function upsertReactionRoles(
  entries: UpsertReactionRoleInput[],
): Promise<void> {
  const db = getDb();
  for (const entry of entries) {
    await db
      .insert(reactionRoles)
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
      });
  }
}

export async function deleteReactionRolesForMessage(
  messageId: string,
): Promise<void> {
  await getDb()
    .delete(reactionRoles)
    .where(eq(reactionRoles.messageId, messageId));
}
