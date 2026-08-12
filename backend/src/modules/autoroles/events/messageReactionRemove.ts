import type {
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import { applyReactionRoleChange } from "./reactionRoleShared.js";

export async function onMessageReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  await applyReactionRoleChange(reaction, user, "remove");
}
