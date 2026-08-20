import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { systemCommandsRoutes } from "./api/routes.js";
import {
  handlePingCommand,
  handleServerInfoCommand,
} from "./commands/utilities.js";

export const systemCommandsModule: AdobosModule = {
  id: "system-commands",
  name: "Comandos del Sistema",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    ctx.route("/api/system-commands", systemCommandsRoutes());

    ctx.command({
      name: "ping",
      description: "Comprueba la latencia del bot.",
      handle: handlePingCommand,
    });
    ctx.command({
      name: "serverinfo",
      description: "Muestra información básica del servidor.",
      handle: handleServerInfoCommand,
    });
  },
};

export {
  SystemCommandsError,
  getCommandPermission,
  listSystemCommandConfigs,
  updateSystemCommandPermissions,
} from "./service.js";
export { assertSystemCommandAllowed } from "./guard.js";
export {
  consumeInteractionEphemeral,
  peekInteractionEphemeral,
  setInteractionEphemeral,
} from "./ephemeral.js";
