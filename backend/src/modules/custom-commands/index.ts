import { GatewayIntentBits } from "discord.js";
import { listSystemCommandNames } from "@adobos/shared";
import type { AdobosModule } from "../../core/modules/types.js";
import { customCommandsRoutes } from "./api/routes.js";
import { setReservedSlashCommandNames } from "./service.js";
import { syncGuildSlashCommands } from "./sync.js";
import { syncGlobalCommands } from "../system-commands/sync.js";
import { logger } from "../../core/log.js";

export const customCommandsModule: AdobosModule = {
  id: "custom-commands",
  name: "Comandos custom",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    // Reservar nombres del catálogo nativo (no usables como custom).
    setReservedSlashCommandNames(listSystemCommandNames());

    ctx.route("/api/custom-commands", customCommandsRoutes(ctx.client), {
      feature: "custom-commands",
    });

    ctx.once("ready", async () => {
      void (async () => {
        try {
          await syncGlobalCommands(ctx.client);
        } catch (error) {
          logger.warn({ err: error }, "slash sync global falló:");
        }
        for (const guild of ctx.client.guilds.cache.values()) {
          try {
            await syncGuildSlashCommands(ctx.client, guild.id);
          } catch (error) {
            logger.warn({ err: error }, `custom-commands: sync inicial falló guild=${guild.id}:`);
          }
        }
      })();
    });

    ctx.on("guildCreate", (guild) => {
      void syncGuildSlashCommands(ctx.client, guild.id).catch((error) => {
        logger.warn({ err: error }, `custom-commands: sync al unirse falló guild=${guild.id}:`);
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
  listCustomCommands,
  updateCustomCommand,
} from "./service.js";
export { handleCustomChatCommand } from "./handler.js";
export { syncGuildSlashCommands } from "./sync.js";
export { parseCustomCommandVariables } from "./variables.js";
