import type { AdobosModule } from "#core/modules/types.js";
import { actionLogsModule } from "#modules/action-logs/module.js";
import { antiRaidModule } from "#modules/anti-raid/module.js";
import { autoDeleteModule } from "#modules/auto-delete/module.js";
import { autoModModule } from "#modules/auto-mod/module.js";
import { autoRepliesModule } from "#modules/auto-replies/module.js";
import { autorolesModule } from "#modules/autoroles/module.js";
import { billingModule } from "#modules/billing/module.js";
import { botProfileModule } from "#modules/bot-profile/module.js";
import { canvasEventsModule } from "#modules/canvas-events/module.js";
import { customCommandsModule } from "#modules/custom-commands/module.js";
import { economyModule } from "#modules/economy/module.js";
import { formsModule } from "#modules/forms/module.js";
import { giveawaysModule } from "#modules/giveaways/module.js";
import { guildAssetsModule } from "#modules/guild-assets/module.js";
import { levelsModule } from "#modules/levels/module.js";
import { messagesModule } from "#modules/messages/module.js";
import { moderationModule } from "#modules/moderation/module.js";
import { remindersModule } from "#modules/reminders/module.js";
import { rolesBuilderModule } from "#modules/roles-builder/module.js";
import { scheduledMessagesModule } from "#modules/scheduled-messages/module.js";
import { starboardModule } from "#modules/starboard/module.js";
import { streamAlertsModule } from "#modules/stream-alerts/module.js";
import { systemCommandsModule } from "#modules/system-commands/module.js";
import { ticketsModule } from "#modules/tickets/module.js";
import { voiceRoomsModule } from "#modules/voice-rooms/module.js";
import { welcomeModule } from "#modules/welcome/module.js";

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
  billingModule,
  voiceRoomsModule,
  remindersModule,
  starboardModule,
  antiRaidModule,
  streamAlertsModule,
  autoRepliesModule,
  ticketsModule,
  giveawaysModule,
];

export {
  actionLogsModule,
  antiRaidModule,
  autoDeleteModule,
  autoModModule,
  autoRepliesModule,
  autorolesModule,
  billingModule,
  botProfileModule,
  canvasEventsModule,
  customCommandsModule,
  economyModule,
  formsModule,
  giveawaysModule,
  guildAssetsModule,
  levelsModule,
  messagesModule,
  moderationModule,
  remindersModule,
  rolesBuilderModule,
  scheduledMessagesModule,
  starboardModule,
  streamAlertsModule,
  systemCommandsModule,
  ticketsModule,
  voiceRoomsModule,
  welcomeModule,
};
