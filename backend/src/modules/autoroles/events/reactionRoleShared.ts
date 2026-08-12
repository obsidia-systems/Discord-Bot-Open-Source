import type {
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import { findReactionRole, toEmojiKey } from "../../../db/reaction-roles.js";

type ReactionLike = MessageReaction | PartialMessageReaction;
type UserLike = User | PartialUser;

async function resolveReactionAndUser(
  reaction: ReactionLike,
  user: UserLike,
): Promise<{ reaction: MessageReaction; user: User } | null> {
  if (user.bot) return null;

  let fullReaction = reaction;
  if (reaction.partial) {
    try {
      fullReaction = await reaction.fetch();
    } catch (error: unknown) {
      console.warn("[adobos] No se pudo fetch de la reacción parcial:", error);
      return null;
    }
  }

  let fullUser = user;
  if (user.partial) {
    try {
      fullUser = await user.fetch();
    } catch (error: unknown) {
      console.warn("[adobos] No se pudo fetch del usuario parcial:", error);
      return null;
    }
  }

  if (fullUser.bot) return null;

  return {
    reaction: fullReaction as MessageReaction,
    user: fullUser as User,
  };
}

/** Lógica compartida: busca mapping en SQLite y añade/quita el rol. */
export async function applyReactionRoleChange(
  reaction: ReactionLike,
  user: UserLike,
  action: "add" | "remove",
): Promise<void> {
  const resolved = await resolveReactionAndUser(reaction, user);
  if (!resolved) return;

  const { reaction: fullReaction, user: fullUser } = resolved;
  const message = fullReaction.message;

  if (!message.guild) return;

  // Evita que el bot se auto-asigne roles si reacciona a sus mensajes
  if (fullUser.bot) return;

  const emojiKey = toEmojiKey({
    id: fullReaction.emoji.id,
    name: fullReaction.emoji.name,
  });
  if (!emojiKey) return;

  const mapping = findReactionRole(message.id, emojiKey);
  if (!mapping) {
    // Mensaje no registrado como menú de reaction roles
    return;
  }

  const member =
    message.guild.members.cache.get(fullUser.id) ??
    (await message.guild.members.fetch(fullUser.id).catch(() => null));

  if (!member || member.user.bot) return;

  const me = message.guild.members.me;
  if (me && member.id === me.id) return;

  try {
    if (action === "add") {
      if (!member.roles.cache.has(mapping.roleId)) {
        await member.roles.add(mapping.roleId, "Adobos reaction role");
      }
    } else if (member.roles.cache.has(mapping.roleId)) {
      await member.roles.remove(mapping.roleId, "Adobos reaction role");
    }
  } catch (error: unknown) {
    console.error(
      `[adobos] Error al ${action === "add" ? "asignar" : "quitar"} rol ${mapping.roleId}:`,
      error,
    );
  }
}
