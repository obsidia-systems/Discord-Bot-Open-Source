import {
  Client,
  type ClientOptions,
  GatewayIntentBits,
  Options,
  Partials,
} from "discord.js";
import { logger } from "../log.js";
import type { ModuleRegistry } from "../modules/registry.js";
import { registerInteractionRouter } from "./interactionRouter.js";

/** Intents mínimos del kernel (siempre activos). */
export const CORE_INTENTS: number[] = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.MessageContent,
];

function shardConfig(): number | number[] | "auto" {
  const raw = process.env.SHARD_COUNT?.trim();
  if (!raw || raw === "auto") return "auto";
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1) return n;
  return "auto";
}

/**
 * Crea el Client Discord fusionando intents del core + módulos,
 * enlaza el interaction router y ejecuta `registry.bindClient`.
 *
 * `shards: "auto"` (o SHARD_COUNT) es sharding interno en un proceso: el panel
 * Express sigue viendo el mismo Client. ShardingManager multi-proceso espera a Postgres.
 */
export function createBotClient(registry: ModuleRegistry): Client {
  const intentSet = new Set<number>([...CORE_INTENTS, ...registry.intents]);

  const options: ClientOptions = {
    shards: shardConfig(),
    intents: [...intentSet],
    allowedMentions: { parse: [] },
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 200,
      PresenceManager: 0,
      GuildMemberManager: 200,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: {
        interval: 3_600,
        lifetime: 1_800,
      },
    },
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

  client.once("ready", () => {
    logger.info(`Bot listo como ${client.user?.tag ?? "desconocido"}`);
  });
  client.on("error", (error) => {
    logger.error({ err: error }, "Error del cliente Discord:");
  });
  client.on("shardReconnecting", (id) => {
    logger.warn(`Reconectando shard ${id}…`);
  });
  client.on("shardResume", (id) => {
    logger.info(`Shard ${id} reanudado.`);
  });

  registerInteractionRouter(client, registry);
  registry.bindClient(client);

  return client;
}
