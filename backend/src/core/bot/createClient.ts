import {
  Client,
  GatewayIntentBits,
  Partials,
  type ClientOptions,
} from "discord.js";
import type { ModuleRegistry } from "../modules/registry.js";
import { registerInteractionRouter } from "./interactionRouter.js";

/** Intents mínimos del kernel (siempre activos). */
export const CORE_INTENTS: number[] = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.MessageContent,
];

/**
 * Crea el Client Discord fusionando intents del core + módulos,
 * enlaza el interaction router y ejecuta `registry.bindClient`.
 */
export function createBotClient(registry: ModuleRegistry): Client {
  const intentSet = new Set<number>([...CORE_INTENTS, ...registry.intents]);

  const options: ClientOptions = {
    intents: [...intentSet],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.GuildMember,
      Partials.Reaction,
      Partials.User,
    ],
    failIfNotExists: false,
  };

  const client = new Client(options);

  // Eventos de infraestructura del kernel
  client.once("ready", () => {
    console.log(`[adobos] Bot listo como ${client.user?.tag ?? "desconocido"}`);
  });
  client.on("error", (error) => {
    console.error("[adobos] Error del cliente Discord:", error);
  });
  client.on("shardReconnecting", (id) => {
    console.warn(`[adobos] Reconectando shard ${id}…`);
  });
  client.on("shardResume", (id) => {
    console.log(`[adobos] Shard ${id} reanudado.`);
  });

  registerInteractionRouter(client, registry);
  registry.bindClient(client);

  return client;
}
