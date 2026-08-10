import type { Client } from "discord.js";
import { onReady } from "./ready.js";
import { onError } from "./error.js";

/** Registro de eventos del núcleo (plugins registrarán los suyos aparte). */
export function registerCoreEvents(client: Client): void {
  client.once("ready", () => onReady(client));
  client.on("error", onError);
  client.on("shardReconnecting", (id) => {
    console.warn(`[adobos] Reconectando shard ${id}…`);
  });
  client.on("shardResume", (id) => {
    console.log(`[adobos] Shard ${id} reanudado.`);
  });
}
