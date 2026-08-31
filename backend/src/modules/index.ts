import type { AdobosModule } from "../core/modules/types.js";
import { welcomeModule } from "./welcome/index.js";
import { canvasEventsModule } from "./canvas-events/index.js";
import { messagesModule } from "./messages/index.js";
import { autorolesModule } from "./autoroles/index.js";
import { guildAssetsModule } from "./guild-assets/index.js";
import { economyModule } from "./economy/index.js";
import { moderationModule } from "./moderation/index.js";
import { botProfileModule } from "./bot-profile/index.js";
import { actionLogsModule } from "./action-logs/index.js";
import { autoModModule } from "./auto-mod/index.js";
import { autoDeleteModule } from "./auto-delete/index.js";
import { formsModule } from "./forms/index.js";
import { scheduledMessagesModule } from "./scheduled-messages/index.js";
import { customCommandsModule } from "./custom-commands/index.js";
import { systemCommandsModule } from "./system-commands/index.js";
import { levelsModule } from "./levels/index.js";
import { rolesBuilderModule } from "./roles-builder/index.js";
import { pokemonModule } from "./pokemon/index.js";
import { billingModule } from "./billing/index.js";

/**
 * Catálogo explícito de módulos habilitados.
 * Añadir un bloque Lego = import + entrada aquí.
 */
export const ENABLED_MODULES: readonly AdobosModule[] = [
  guildAssetsModule,
  botProfileModule,
  messagesModule,
  welcomeModule,
  canvasEventsModule,
  autorolesModule,
  economyModule,
  moderationModule,
  actionLogsModule,
  autoModModule,
  autoDeleteModule,
  formsModule,
  scheduledMessagesModule,
  customCommandsModule,
  systemCommandsModule,
  levelsModule,
  rolesBuilderModule,
  pokemonModule,
  billingModule,
];

export {
  welcomeModule,
  canvasEventsModule,
  messagesModule,
  autorolesModule,
  guildAssetsModule,
  economyModule,
  moderationModule,
  botProfileModule,
  actionLogsModule,
  autoModModule,
  autoDeleteModule,
  formsModule,
  scheduledMessagesModule,
  customCommandsModule,
  systemCommandsModule,
  levelsModule,
  rolesBuilderModule,
  pokemonModule,
  billingModule,
};
