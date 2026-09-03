import { GatewayIntentBits } from "discord.js";
import { listSystemCommandNames } from "@adobos/shared";
import type { AdobosModule } from "../../core/modules/types.js";
import { customCommandsRoutes } from "./api/routes.js";
import { handleCustomChatCommand } from "./handler.js";
import { setReservedSlashCommandNames } from "./service.js";
import { syncGuildSlashCommands } from "./sync.js";
import { logger } from "../../core/log.js";

export const customCommandsModule: AdobosModule = {
  id: "custom-commands",
  name: "Custom Commands",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    setReservedSlashCommandNames(listSystemCommandNames());

    ctx.route("/api/custom-commands", customCommandsRoutes(ctx.client), {
      feature: "custom-commands",
    });
    ctx.fallbackChat(handleCustomChatCommand);

    ctx.on("guildCreate", (guild) => {
      void syncGuildSlashCommands(ctx.client, guild.id).catch((error) => {
        logger.warn(
          { err: error },
          `custom-commands: sync on join failed guild=${guild.id}`,
        );
      });
    });
  },
};

/** @deprecated El catálogo shared ya reserva nombres; se mantiene por compat. */
export function wireCustomCommandsBuiltinSync(
  _commands?: {
    name: string;
    description: string;
    options?: import("discord.js").APIApplicationCommandOption[];
  }[],
): void {
  setReservedSlashCommandNames(listSystemCommandNames());
}

export {
  CustomCommandsError,
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommand,
  getCustomCommandByName,
  listActiveCustomCommands,
  listCustomCommands,
  setCustomCommandActive,
  updateCustomCommand,
} from "./service.js";
export { handleCustomChatCommand } from "./handler.js";
export { syncGuildSlashCommands } from "./sync.js";
export { parseCustomCommandVariables } from "./variables.js";
