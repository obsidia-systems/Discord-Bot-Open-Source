import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { scheduledMessagesRoutes } from "./api/routes.js";
import {
  bindScheduledMessagesScheduler,
  onScheduledMessageRemoved,
  rehydrateAllScheduledJobs,
  syncScheduledJob,
} from "./scheduler.js";
import { setScheduledMessageChangeListener } from "./service.js";

export const scheduledMessagesModule: AdobosModule = {
  id: "scheduled-messages",
  name: "Mensajes programados",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  register(ctx) {
    bindScheduledMessagesScheduler(ctx.client);
    setScheduledMessageChangeListener(async (message, previousId) => {
      if (!message && previousId != null) {
        onScheduledMessageRemoved(previousId);
        return;
      }
      if (message) await syncScheduledJob(message);
    });

    ctx.route("/api/scheduled-messages", scheduledMessagesRoutes(ctx.client), {
      feature: "scheduled-messages",
    });

    ctx.once("ready", async () => {
      await rehydrateAllScheduledJobs();
      console.log("[adobos] scheduled-messages: crons rehidratados");
    });
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
