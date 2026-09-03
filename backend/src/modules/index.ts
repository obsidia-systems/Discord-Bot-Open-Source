import type { AdobosModule } from "#core/modules/types.js";
import { actionLogsModule } from "#modules/action-logs/index.js";
import { antiRaidModule } from "#modules/anti-raid/index.js";
import { autoDeleteModule } from "#modules/auto-delete/index.js";
import { autoModModule } from "#modules/auto-mod/index.js";
import { autoRepliesModule } from "#modules/auto-replies/index.js";
import { autorolesModule } from "#modules/autoroles/index.js";
import { billingModule } from "#modules/billing/index.js";
import { botProfileModule } from "#modules/bot-profile/index.js";
import { canvasEventsModule } from "#modules/canvas-events/index.js";
import { customCommandsModule } from "#modules/custom-commands/index.js";
import { economyModule } from "#modules/economy/index.js";
import { formsModule } from "#modules/forms/index.js";
import { giveawaysModule } from "#modules/giveaways/index.js";
import { guildAssetsModule } from "#modules/guild-assets/index.js";
import { levelsModule } from "#modules/levels/index.js";
import { messagesModule } from "#modules/messages/index.js";
import { moderationModule } from "#modules/moderation/index.js";
import { remindersModule } from "#modules/reminders/index.js";
import { rolesBuilderModule } from "#modules/roles-builder/index.js";
import { scheduledMessagesModule } from "#modules/scheduled-messages/index.js";
import { starboardModule } from "#modules/starboard/index.js";
import { streamAlertsModule } from "#modules/stream-alerts/index.js";
import { systemCommandsModule } from "#modules/system-commands/index.js";
import { ticketsModule } from "#modules/tickets/index.js";
import { voiceRoomsModule } from "#modules/voice-rooms/index.js";
import { welcomeModule } from "#modules/welcome/index.js";

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
