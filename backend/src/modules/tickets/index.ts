import {
  TICKET_ADD_MODAL_PREFIX,
  TICKET_ADD_PREFIX,
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_OPEN_PREFIX,
  TICKET_REASON_PREFIX,
  TICKET_REMOVE_MODAL_PREFIX,
  TICKET_REMOVE_PREFIX,
  TICKET_UNCLAIM_PREFIX,
  TICKET_UNWAIT_PREFIX,
  TICKET_WAIT_PREFIX,
} from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { ticketsRoutes } from "./api/routes.js";
import { onTicketsChannelDelete, onTicketsMessageCreate } from "./events.js";
import {
  onTicketAddButton,
  onTicketAddModal,
  onTicketClaimButton,
  onTicketCloseButton,
  onTicketOpenButton,
  onTicketReasonModal,
  onTicketRemoveButton,
  onTicketRemoveModal,
  onTicketUnclaimButton,
  onTicketUnwaitButton,
  onTicketWaitButton,
} from "./handlers.js";

export const ticketsModule: AdobosModule = {
  id: "tickets",
  name: "Tickets",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  register(ctx) {
    ctx.route("/api/tickets", ticketsRoutes(ctx.client), {
      feature: "tickets",
    });
    ctx.button(TICKET_OPEN_PREFIX, (interaction) =>
      onTicketOpenButton(interaction),
    );
    ctx.button(TICKET_CLAIM_PREFIX, (interaction) =>
      onTicketClaimButton(interaction),
    );
    ctx.button(TICKET_UNCLAIM_PREFIX, (interaction) =>
      onTicketUnclaimButton(interaction),
    );
    ctx.button(TICKET_WAIT_PREFIX, (interaction) =>
      onTicketWaitButton(interaction),
    );
    ctx.button(TICKET_UNWAIT_PREFIX, (interaction) =>
      onTicketUnwaitButton(interaction),
    );
    ctx.button(TICKET_CLOSE_PREFIX, (interaction) =>
      onTicketCloseButton(interaction),
    );
    ctx.button(TICKET_ADD_PREFIX, (interaction) =>
      onTicketAddButton(interaction),
    );
    ctx.button(TICKET_REMOVE_PREFIX, (interaction) =>
      onTicketRemoveButton(interaction),
    );
    ctx.modal(TICKET_REASON_PREFIX, (interaction) =>
      onTicketReasonModal(interaction),
    );
    ctx.modal(TICKET_ADD_MODAL_PREFIX, (interaction) =>
      onTicketAddModal(interaction),
    );
    ctx.modal(TICKET_REMOVE_MODAL_PREFIX, (interaction) =>
      onTicketRemoveModal(interaction),
    );
    ctx.on("channelDelete", (channel) => {
      void onTicketsChannelDelete(channel);
    });
    ctx.on("messageCreate", (message) => {
      void onTicketsMessageCreate(message);
    });
  },
};

export { publishTicketPanel } from "./publish.js";
export { TicketsError } from "./service.js";
