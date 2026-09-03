import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { scheduledMessagesRoutes } from "./api/routes.js";
import {
  bindScheduledMessagesScheduler,
  processDueScheduledMessages,
  rehydrateScheduledMessages,
} from "./scheduler.js";
import { logger } from "../../core/log.js";
import { isWorkerLeader } from "../../core/runtime/index.js";
import { registerJob } from "../../core/lifecycle.js";

const DUE_TICK_MS = 15_000;

export const scheduledMessagesModule: AdobosModule = {
  id: "scheduled-messages",
  name: "Scheduled Messages",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  register(ctx) {
    bindScheduledMessagesScheduler(ctx.client);

    ctx.route("/api/scheduled-messages", scheduledMessagesRoutes(ctx.client), {
      feature: "scheduled-messages",
    });

    ctx.once("ready", async () => {
      if (!isWorkerLeader()) return;
      await rehydrateScheduledMessages();
      logger.info("scheduled-messages: next_run_at rehidratado");
      try {
        await processDueScheduledMessages();
      } catch (error) {
        logger.warn({ err: error }, "scheduled-messages: initial tick failed");
      }
    });

    const timer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processDueScheduledMessages().catch((error: unknown) => {
        logger.warn({ err: error }, "scheduled-messages: tick failed");
      });
    }, DUE_TICK_MS);
    registerJob("scheduled-messages:due", timer);
  },
};

export {
  ScheduledMessagesError,
  createScheduledMessage,
  deleteScheduledMessage,
  getScheduledMessage,
  listAllActiveScheduledMessages,
  listScheduledMessages,
  setScheduledMessageActive,
  updateScheduledMessage,
} from "./service.js";
