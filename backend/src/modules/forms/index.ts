import {
  FORM_ACCEPT_PREFIX,
  FORM_DENY_PREFIX,
  FORM_OPEN_PREFIX,
  FORM_SUBMIT_PREFIX,
} from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { formsRoutes } from "./api/routes.js";
import {
  onFormsModalSubmit,
  onFormsOpenButton,
  onFormsReviewButton,
} from "./handlers.js";

export const formsModule: AdobosModule = {
  id: "forms",
  name: "Forms",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  register(ctx) {
    ctx.route("/api/forms", formsRoutes(ctx.client), { feature: "forms" });
    ctx.button(FORM_OPEN_PREFIX, (interaction) =>
      onFormsOpenButton(interaction),
    );
    ctx.button(FORM_ACCEPT_PREFIX, (interaction) =>
      onFormsReviewButton(interaction),
    );
    ctx.button(FORM_DENY_PREFIX, (interaction) =>
      onFormsReviewButton(interaction),
    );
    ctx.modal(FORM_SUBMIT_PREFIX, (interaction) =>
      onFormsModalSubmit(interaction, ctx.client),
    );
  },
};

export { publishFormMessage } from "./publish.js";
export {
  createForm,
  deleteForm,
  FormsError,
  getForm,
  getFormById,
  invalidateFormsCache,
  invalidateFormsConfigCache,
  listFormResponses,
  listForms,
  updateForm,
} from "./service.js";
