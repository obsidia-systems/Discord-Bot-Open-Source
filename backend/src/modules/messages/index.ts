import type { AdobosModule } from "../../core/modules/types.js";
import { messageRoutes } from "./api/routes.js";

export const messagesModule: AdobosModule = {
  id: "messages",
  name: "Mensajes",
  register(ctx) {
    ctx.route("/api/messages", messageRoutes(ctx.client));
  },
};

export {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
} from "./api/controller.js";
