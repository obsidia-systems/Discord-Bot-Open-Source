import { REST, Routes, type Client, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import { listCustomCommands } from "./service.js";

type BuiltinSlashBody = Pick<
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  "name" | "description" | "options"
>;

let builtinBodies: BuiltinSlashBody[] = [];

export function setBuiltinSlashBodies(bodies: BuiltinSlashBody[]): void {
  builtinBodies = bodies.map((b) => ({
    name: b.name,
    description: b.description.slice(0, 100),
    ...(b.options?.length ? { options: b.options } : {}),
  }));
}

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
 * built-ins del registry + comandos custom de SQLite.
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
  const customs = listCustomCommands(gid);

  const reserved = new Set(builtinBodies.map((b) => b.name));
  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
    ...builtinBodies.map((b) => ({
      name: b.name,
      description: b.description,
      ...(b.options?.length ? { options: b.options } : {}),
    })),
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
    `[adobos] custom-commands: sync Discord (${body.length} slash) guild=${gid}`,
  );
  return body.length;
}
