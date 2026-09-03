import { GIVEAWAY_JOIN_PREFIX } from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import { registerJob } from "../../core/lifecycle.js";
import { logger } from "../../core/log.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { isWorkerLeader } from "../../core/runtime/index.js";
import { giveawaysRoutes } from "./api/routes.js";
import { onGiveawayChannelDelete, onGiveawayMessageDelete } from "./events.js";
import { onGiveawayJoinButton } from "./handlers.js";
import { bindGiveawaysScheduler, processDueGiveaways } from "./scheduler.js";

const DUE_TICK_MS = 15_000;

export const giveawaysModule: AdobosModule = {
  id: "giveaways",
  name: "Giveaways",
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  register(ctx) {
    bindGiveawaysScheduler(ctx.client);
    ctx.route("/api/giveaways", giveawaysRoutes(ctx.client), {
      feature: "giveaways",
    });
    ctx.button(GIVEAWAY_JOIN_PREFIX, (interaction) =>
      onGiveawayJoinButton(interaction),
    );
    ctx.on("messageDelete", (message) => {
      void onGiveawayMessageDelete(message);
    });
    ctx.on("channelDelete", (channel) => {
      void onGiveawayChannelDelete(channel);
    });
    ctx.once("ready", () => {
      if (!isWorkerLeader()) return;
      void processDueGiveaways().catch((error: unknown) => {
        logger.warn({ err: error }, "giveaways: initial tick failed");
      });
    });
    const timer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processDueGiveaways().catch((error: unknown) => {
        logger.warn({ err: error }, "giveaways: tick failed");
      });
    }, DUE_TICK_MS);
    registerJob("giveaways:due", timer);
  },
};

export { GiveawaysError } from "./service.js";
