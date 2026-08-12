import type { AdobosModule } from "../core/modules/types.js";
import { welcomeModule } from "./welcome/index.js";
import { messagesModule } from "./messages/index.js";
import { autorolesModule } from "./autoroles/index.js";
import { guildAssetsModule } from "./guild-assets/index.js";
import { economyModule } from "./economy/index.js";
import { moderationModule } from "./moderation/index.js";

/**
 * Catálogo explícito de módulos habilitados.
 * Añadir un bloque Lego = import + entrada aquí.
 */
export const ENABLED_MODULES: readonly AdobosModule[] = [
  guildAssetsModule,
  messagesModule,
  welcomeModule,
  autorolesModule,
  economyModule,
  moderationModule,
];

export {
  welcomeModule,
  messagesModule,
  autorolesModule,
  guildAssetsModule,
  economyModule,
  moderationModule,
};
