import { REST, type Client } from "discord.js";

export function discordApplicationId(client: Client): string {
  const fromEnv = process.env.DISCORD_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  const id = client.user?.id;
  if (!id) {
    throw new Error("DISCORD_CLIENT_ID no definido y el bot aún no está listo.");
  }
  return id;
}

export function createDiscordRest(): REST | null {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) return null;
  return new REST({ version: "10" }).setToken(token);
}
