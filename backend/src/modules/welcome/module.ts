import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { onGuildMemberAdd } from "./gateway/guildMemberAdd.js";
import { welcomeSettingsRoutes } from "./http/routes.js";

export const welcomeModule: AdobosModule = {
  id: "welcome",
  name: "Welcome",
  intents: [GatewayIntentBits.GuildMembers],
  register(ctx) {
    ctx.on("guildMemberAdd", (member) => {
      void onGuildMemberAdd(member);
    });
    ctx.route("/api/welcome-settings", welcomeSettingsRoutes(ctx.client), {
      feature: "welcome",
    });
  },
};

export {
  AVATAR_SIZE_MAX,
  AVATAR_SIZE_MIN,
  buildWelcomeCard,
  CARD_HEIGHT,
  CARD_WIDTH,
  WELCOME_CARD_DEFAULT_BACKGROUND,
} from "./card/WelcomeCardBuilder.js";
export {
  disableWelcomeSettings,
  getWelcomeSettings,
  saveWelcomeSettings,
  WelcomeSettingsError,
} from "./domain/welcome.js";
