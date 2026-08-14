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
};
