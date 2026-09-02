import type { AdobosModule } from "../../core/modules/types.js";
import { messageRoutes } from "./api/routes.js";
import { embedTemplateRoutes } from "./api/templateRoutes.js";
import { embedLibraryRoutes } from "./api/libraryRoutes.js";

export const messagesModule: AdobosModule = {
  id: "messages",
  name: "Messages",
  register(ctx) {
    ctx.route("/api/messages", messageRoutes(ctx.client), { feature: "messages" });
    ctx.route("/api/embeds/templates", embedTemplateRoutes(ctx.client), {
      feature: "messages",
    });
    ctx.route("/api/embeds", embedLibraryRoutes(ctx.client), {
      feature: "messages",
    });
  },
};

export {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
} from "./api/controller.js";
