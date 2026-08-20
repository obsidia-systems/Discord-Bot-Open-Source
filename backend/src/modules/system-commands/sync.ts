import type {
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { REST, Routes } from "discord.js";
import {
  SYSTEM_COMMAND_CATALOG,
  toDiscordSlashCommandBody,
} from "@adobos/shared";
import { getCommandPermission } from "./service.js";

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
 * Catálogo filtrado por permisos de la guild (`enabled !== false`).
 * Sin fila en DB → usa `defaultEnabled` del catálogo.
 */
export function listEnabledDefaultCommands(guildId: string) {
  return SYSTEM_COMMAND_CATALOG.filter((def) => {
    const perm = getCommandPermission(guildId, def.name);
    return perm.enabled;
  });
}

/** Cuerpos REST de slash nativos habilitados para la guild. */
export function buildEnabledDefaultSlashBodies(
  guildId: string,
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return listEnabledDefaultCommands(guildId).map((def) =>
    toDiscordSlashCommandBody(def),
  ) as RESTPostAPIChatInputApplicationCommandsJSONBody[];
}

/**
 * Registra en Discord solo los comandos nativos habilitados + (opcional) customs
 * vía `syncGuildSlashCommands` del módulo custom-commands.
 *
 * Esta función escribe únicamente los defaults (útil para tests).
 * Preferir `syncGuildSlashCommands` en producción para no borrar customs.
 */
export async function syncDefaultCommands(
  client: Client,
  guildId?: string,
): Promise<number> {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) {
    console.warn(
      "[adobos] system-commands: sin DISCORD_TOKEN — no se sincronizan slash.",
    );
    return 0;
  }

  const gid = resolveGuildId(guildId);
  const body = buildEnabledDefaultSlashBodies(gid);
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(
    Routes.applicationGuildCommands(resolveClientId(client), gid),
    { body },
  );
  console.log(
    `[adobos] system-commands: sync Discord (${body.length} nativos) guild=${gid}`,
  );
  return body.length;
}
