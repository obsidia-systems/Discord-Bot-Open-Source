import type { AdobosModule } from "#core/modules/types.js";
import { embedLibraryRoutes } from "./http/libraryRoutes.js";
import { messageRoutes } from "./http/routes.js";
import { embedTemplateRoutes } from "./http/templateRoutes.js";

export const messagesModule: AdobosModule = {
  id: "messages",
  name: "Messages",
  register(ctx) {
    ctx.route("/api/messages", messageRoutes(ctx.botGateway), {
      feature: "messages",
    });
    ctx.route("/api/embeds/templates", embedTemplateRoutes(), {
      feature: "messages",
    });
    ctx.route("/api/embeds", embedLibraryRoutes(ctx.botGateway), {
      feature: "messages",
    });
  },
};

export {
  MessageSendError,
  sendEmbedMessage,
  sendTextMessage,
} from "./http/controller.js";
