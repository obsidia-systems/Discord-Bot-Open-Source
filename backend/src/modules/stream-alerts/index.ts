import { GatewayIntentBits } from "discord.js";
import { STREAM_ALERT_POLL_MS } from "@adobos/shared";
import type { AdobosModule } from "../../core/modules/types.js";
import { isWorkerLeader } from "../../core/runtime/index.js";
import { registerJob } from "../../core/lifecycle.js";
import { logger } from "../../core/log.js";
import { streamAlertsRoutes } from "./api/routes.js";
import { bindStreamAlertsPoller, processStreamAlerts } from "./poller.js";

export const streamAlertsModule: AdobosModule = {
  id: "stream-alerts",
  name: "Stream Alerts",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    bindStreamAlertsPoller(ctx.client);
    ctx.route("/api/stream-alerts", streamAlertsRoutes(ctx.client), {
      feature: "stream-alerts",
    });
    ctx.once("ready", () => {
      if (!isWorkerLeader()) return;
      void processStreamAlerts().catch((error: unknown) => {
        logger.warn({ err: error }, "stream-alerts: initial tick failed");
      });
    });
    const timer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processStreamAlerts().catch((error: unknown) => {
        logger.warn({ err: error }, "stream-alerts: tick failed");
      });
    }, STREAM_ALERT_POLL_MS);
    registerJob("stream-alerts:poll", timer);
  },
};

export {
  StreamAlertsError,
  createStreamAlert,
  deleteStreamAlert,
  listStreamAlertsConfig,
  updateStreamAlert,
} from "./service.js";
