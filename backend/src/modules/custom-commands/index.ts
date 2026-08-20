import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { customCommandsRoutes } from "./api/routes.js";
import {
  setReservedSlashCommandNames,
} from "./service.js";
import { setBuiltinSlashBodies, syncGuildSlashCommands } from "./sync.js";

export const customCommandsModule: AdobosModule = {
  id: "custom-commands",
  name: "Comandos custom",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    ctx.route("/api/custom-commands", customCommandsRoutes(ctx.client));

    ctx.once("ready", () => {
      void (async () => {
        try {
          await syncGuildSlashCommands(ctx.client);
        } catch (error) {
          console.warn(
            "[adobos] custom-commands: sync inicial falló:",
            error,
          );
        }
      })();
    });
  },
};

/** Llamar tras loadModules para fusionar built-ins en el sync Discord. */
export function wireCustomCommandsBuiltinSync(
  commands: { name: string; description: string }[],
): void {
  setBuiltinSlashBodies(commands);
  setReservedSlashCommandNames(commands.map((c) => c.name));
}

export {
  CustomCommandsError,
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommand,
  getCustomCommandByName,
  listCustomCommands,
  updateCustomCommand,
} from "./service.js";
export { handleCustomChatCommand } from "./handler.js";
export { syncGuildSlashCommands } from "./sync.js";
export { parseCustomCommandVariables } from "./variables.js";
