import { REST } from "@discordjs/rest";

/**
 * Cliente REST de Discord por token (sin gateway). Lo usa el rol `api` para
 * leer/escribir en Discord sin sostener un `Client` vivo, y el `worker` para
 * los side-effects de sus jobs (enviar, borrar, editar). Respeta el rate-limit
 * global igual que la cola interna de discord.js.
 */
let rest: REST | null = null;

export function getDiscordRest(token: string): REST {
  if (!rest) {
    rest = new REST({ version: "10" }).setToken(token);
  }
  return rest;
}

export function hasDiscordRest(): boolean {
  return rest !== null;
}

/** Solo para tests: descarta el singleton. */
export function resetDiscordRest(): void {
  rest = null;
}
