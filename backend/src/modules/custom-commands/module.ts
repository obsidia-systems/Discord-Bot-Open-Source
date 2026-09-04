import { listSystemCommandNames } from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import { logger } from "#core/log.js";
import type { AdobosModule } from "#core/modules/types.js";
import { setReservedSlashCommandNames } from "./domain/custom-commands.js";
import { handleCustomChatCommand } from "./handler.js";
import { customCommandsRoutes } from "./http/routes.js";
import { syncGuildSlashCommands } from "./sync.js";

export const customCommandsModule: AdobosModule = {
  id: "custom-commands",
  name: "Custom Commands",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    setReservedSlashCommandNames(listSystemCommandNames());

    ctx.route("/api/custom-commands", customCommandsRoutes(ctx.botGateway), {
      feature: "custom-commands",
    });
    ctx.fallbackChat(handleCustomChatCommand);

    ctx.on("guildCreate", (guild) => {
      void syncGuildSlashCommands(guild.id, ctx.client).catch((error) => {
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
} from "./domain/custom-commands.js";
export { handleCustomChatCommand } from "./handler.js";
export { syncGuildSlashCommands } from "./sync.js";
export { parseCustomCommandVariables } from "./variables.js";
