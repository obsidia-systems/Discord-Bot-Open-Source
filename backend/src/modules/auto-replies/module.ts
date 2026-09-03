import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { onAutoReplyMessageCreate } from "./gateway.js";
import { autoRepliesRoutes } from "./http/routes.js";

export const autoRepliesModule: AdobosModule = {
  id: "auto-replies",
  name: "Auto-Replies",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  register(ctx) {
    ctx.route("/api/auto-replies", autoRepliesRoutes(), {
      feature: "auto-replies",
    });
    ctx.on("messageCreate", (message) => {
      void onAutoReplyMessageCreate(message);
    });
  },
};

export {
  AutoRepliesError,
  createAutoReply,
  deleteAutoReply,
  listAutoRepliesConfig,
  updateAutoReply,
} from "./domain/auto-replies.js";
