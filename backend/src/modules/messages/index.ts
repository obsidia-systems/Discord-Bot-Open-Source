import type { AdobosModule } from "../../core/modules/types.js";
import { messageRoutes } from "./api/routes.js";
import { embedTemplateRoutes } from "./api/templateRoutes.js";

export const messagesModule: AdobosModule = {
  id: "messages",
  name: "Mensajes",
  register(ctx) {
    ctx.route("/api/messages", messageRoutes(ctx.client));
    ctx.route("/api/embeds/templates", embedTemplateRoutes(ctx.client));
  },
};

export {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
} from "./api/controller.js";
