import {
  REMIND_BUTTON_CANCEL_PREFIX,
  remindersSlashCommandBody,
} from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import { registerJob } from "../../core/lifecycle.js";
import { logger } from "../../core/log.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { isWorkerLeader } from "../../core/runtime/index.js";
import { remindersRoutes } from "./api/routes.js";
import { handleRemindCancelButton, handleRemindCommand } from "./commands.js";
import { bindRemindersScheduler, processDueReminders } from "./scheduler.js";

const DUE_TICK_MS = 15_000;
const slash = remindersSlashCommandBody();

export const remindersModule: AdobosModule = {
  id: "reminders",
  name: "Reminders",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    bindRemindersScheduler(ctx.client);
    ctx.route("/api/reminders", remindersRoutes(), { feature: "reminders" });
    ctx.command({
      name: slash.name,
      description: slash.description,
      handle: (interaction) => handleRemindCommand(interaction),
    });
    ctx.button(REMIND_BUTTON_CANCEL_PREFIX, (interaction) =>
      handleRemindCancelButton(interaction),
    );
    ctx.once("ready", () => {
      if (!isWorkerLeader()) return;
      void processDueReminders().catch((error: unknown) => {
        logger.warn({ err: error }, "reminders: initial tick failed");
      });
    });
    const timer = setInterval(() => {
      if (!isWorkerLeader()) return;
      void processDueReminders().catch((error: unknown) => {
        logger.warn({ err: error }, "reminders: tick failed");
      });
    }, DUE_TICK_MS);
    registerJob("reminders:due", timer);
  },
};

export {
  createReminder,
  deleteReminder,
  listRemindersConfig,
  RemindersError,
  updateReminderSettings,
} from "./service.js";
