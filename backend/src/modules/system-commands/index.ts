import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { systemCommandsRoutes } from "./api/routes.js";

export const systemCommandsModule: AdobosModule = {
  id: "system-commands",
  name: "Comandos del Sistema",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    ctx.route("/api/system-commands", systemCommandsRoutes(ctx.client), {
      feature: "system-commands",
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
export {
  buildEnabledDefaultSlashBodies,
  buildGlobalDefaultSlashBodies,
  listEnabledDefaultCommands,
  syncDefaultCommands,
  syncGlobalCommands,
} from "./sync.js";
export { dispatchDefaultCommand } from "./handlers/index.js";
