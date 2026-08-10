import type { Client } from "discord.js";

export function onReady(client: Client): void {
  console.log(`[adobos] Bot listo como ${client.user?.tag ?? "desconocido"}`);
}
