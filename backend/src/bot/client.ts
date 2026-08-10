import { Client, GatewayIntentBits, Partials } from "discord.js";
import { registerCoreEvents } from "./events/index.js";

/**
 * Cliente Discord con reconexión nativa de discord.js (WebSocket 24/7).
 * Intents mínimos del núcleo; los plugins pueden documentar intents extra.
 */
export function createBotClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
    failIfNotExists: false,
  });

  registerCoreEvents(client);
  return client;
}
