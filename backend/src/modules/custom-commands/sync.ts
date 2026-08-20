import { REST, Routes, type Client, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import { listSystemCommandNames } from "@adobos/shared";
import { listCustomCommands } from "./service.js";
import { buildEnabledDefaultSlashBodies } from "../system-commands/sync.js";

function resolveClientId(client: Client): string {
  const fromEnv = process.env.DISCORD_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  const id = client.user?.id;
  if (!id) {
    throw new Error("DISCORD_CLIENT_ID no definido y el bot aún no está listo.");
  }
  return id;
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new Error("Falta DISCORD_GUILD_ID para sincronizar slash commands.");
  }
  return id;
}

/**
 * Bulk-overwrite de slash commands del guild:
 * nativos habilitados (catálogo + DB) + comandos custom de SQLite.
 */
export async function syncGuildSlashCommands(
  client: Client,
  guildId?: string,
): Promise<number> {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) {
    console.warn(
      "[adobos] custom-commands: sin DISCORD_TOKEN — no se sincronizan slash.",
    );
    return 0;
  }

  const gid = resolveGuildId(guildId);
  const clientId = resolveClientId(client);
  const builtins = buildEnabledDefaultSlashBodies(gid);
  const reserved = new Set([
    ...listSystemCommandNames(),
    ...builtins.map((b) => b.name),
  ]);
  const customs = listCustomCommands(gid);

  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
    ...builtins,
    ...customs
      .filter((c) => !reserved.has(c.name))
      .map((c) => ({
        name: c.name,
        description: c.description.slice(0, 100) || "Comando personalizado",
      })),
  ];

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, gid), { body });
  console.log(
    `[adobos] slash sync Discord (${builtins.length} nativos + ${body.length - builtins.length} custom) guild=${gid}`,
  );
  return body.length;
}
