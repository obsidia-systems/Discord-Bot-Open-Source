import { SYSTEM_COMMAND_CATALOG } from "@adobos/shared";
import { GatewayIntentBits, MessageFlags } from "discord.js";
import { logger } from "#core/log.js";
import type { AdobosModule } from "#core/modules/types.js";
import { handleBuyAutocomplete } from "#modules/economy/commands/buy.js";
import { handleUseAutocomplete } from "#modules/economy/commands/inventory.js";
import { assertSystemCommandAllowed } from "./guard.js";
import { dispatchDefaultCommand } from "./handlers/index.js";
import { systemCommandsRoutes } from "./http/routes.js";
import { syncGlobalCommands } from "./sync.js";

export const systemCommandsModule: AdobosModule = {
  id: "system-commands",
  name: "System Commands",
  intents: [GatewayIntentBits.Guilds],
  register(ctx) {
    ctx.route("/api/system-commands", systemCommandsRoutes(), {
      feature: "system-commands",
    });
    ctx.autocomplete("buy", handleBuyAutocomplete);
    ctx.autocomplete("use", handleUseAutocomplete);
    for (const def of SYSTEM_COMMAND_CATALOG) {
      ctx.command({
        name: def.name,
        description: def.description,
        handle: async (interaction) => {
          const guard = await assertSystemCommandAllowed(interaction);
          if (!guard.ok) {
            await interaction.reply({
              content: guard.message,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await dispatchDefaultCommand(interaction);
        },
      });
    }
    ctx.once("ready", async () => {
      try {
        await syncGlobalCommands(ctx.client);
      } catch (error) {
        logger.warn(
          { err: error },
          "system-commands: global slash sync failed",
        );
      }
    });
  },
};

export {
  getCommandPermission,
  listSystemCommandConfigs,
  SystemCommandsError,
  updateSystemCommandPermissions,
} from "./domain/system-commands.js";
export {
  consumeInteractionEphemeral,
  peekInteractionEphemeral,
  setInteractionEphemeral,
} from "./ephemeral.js";
export { assertSystemCommandAllowed } from "./guard.js";
export { dispatchDefaultCommand } from "./handlers/index.js";
export {
  buildEnabledDefaultSlashBodies,
  buildGlobalDefaultSlashBodies,
  listEnabledDefaultCommands,
  syncDefaultCommands,
  syncGlobalCommands,
} from "./sync.js";
