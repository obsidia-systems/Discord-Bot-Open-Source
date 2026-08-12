import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { welcomeSettingsRoutes } from "./api/routes.js";
import { onGuildMemberAdd } from "./events/guildMemberAdd.js";

export const welcomeModule: AdobosModule = {
  id: "welcome",
  name: "Bienvenidas",
  intents: [GatewayIntentBits.GuildMembers],
  register(ctx) {
    ctx.on("guildMemberAdd", (member) => {
      void onGuildMemberAdd(member);
    });
    ctx.route("/api/welcome-settings", welcomeSettingsRoutes(ctx.client));
  },
};

export {
  getWelcomeSettings,
  saveWelcomeSettings,
  disableWelcomeSettings,
  WelcomeSettingsError,
} from "./service.js";
export {
  buildWelcomeCard,
  CARD_WIDTH,
  CARD_HEIGHT,
  AVATAR_SIZE_MIN,
  AVATAR_SIZE_MAX,
  WELCOME_CARD_DEFAULT_BACKGROUND,
} from "./card/WelcomeCardBuilder.js";
