import type {
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
} from "discord.js";
import type { ModuleContext } from "../../core/modules/types.js";
import { logger } from "../../core/log.js";
import {
  onStarboardMessageDelete,
  syncStarboardMessage,
  syncStarboardReaction,
} from "./board.js";

function catchBoard(label: string, error: unknown): void {
  logger.warn({ err: error }, `starboard: ${label}`);
}

export function registerStarboardListeners(ctx: ModuleContext): void {
  ctx.on("messageReactionAdd", (reaction, _user) => {
    syncStarboardReaction(reaction as MessageReaction | PartialMessageReaction);
  });
  ctx.on("messageReactionRemove", (reaction, _user) => {
    syncStarboardReaction(reaction as MessageReaction | PartialMessageReaction);
  });
  ctx.on("messageReactionRemoveEmoji", (reaction) => {
    syncStarboardReaction(reaction as MessageReaction | PartialMessageReaction);
  });
  ctx.on("messageReactionRemoveAll", (message) => {
    syncStarboardMessage(message as Message | PartialMessage);
  });
  ctx.on("messageDelete", (message) => {
    void onStarboardMessageDelete(message as Message | PartialMessage).catch(
      (error: unknown) => catchBoard("messageDelete", error),
    );
  });
  ctx.on("messageDeleteBulk", (messages) => {
    for (const message of messages.values()) {
      void onStarboardMessageDelete(message as Message | PartialMessage).catch(
        (error: unknown) => catchBoard("messageDeleteBulk", error),
      );
    }
  });
}
