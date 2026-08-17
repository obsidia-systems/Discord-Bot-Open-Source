import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { FORM_OPEN_PREFIX, FORM_SUBMIT_PREFIX } from "@adobos/shared";
import { formsRoutes } from "./api/routes.js";
import { onFormsModalSubmit, onFormsOpenButton } from "./handlers.js";

export const formsModule: AdobosModule = {
  id: "forms",
  name: "Formularios",
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  register(ctx) {
    ctx.route("/api/forms", formsRoutes(ctx.client));
    ctx.button(FORM_OPEN_PREFIX, (interaction) =>
      onFormsOpenButton(interaction),
    );
    ctx.modal(FORM_SUBMIT_PREFIX, (interaction) =>
      onFormsModalSubmit(interaction, ctx.client),
    );
  },
};

export {
  FormsError,
  createForm,
  deleteForm,
  getForm,
  getFormById,
  invalidateFormsCache,
  invalidateFormsConfigCache,
  listFormResponses,
  listForms,
  updateForm,
} from "./service.js";
export { publishFormMessage } from "./publish.js";
