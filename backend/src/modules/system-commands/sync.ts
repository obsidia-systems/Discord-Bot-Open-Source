import type {
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { PermissionFlagsBits, REST, Routes } from "discord.js";
import {
  SYSTEM_COMMAND_CATALOG,
  resolveDiscordPermPreset,
  toDiscordSlashCommandBody,
  type SystemCommandDefinition,
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
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new Error("Falta guildId para sincronizar slash commands.");
  }
  return id;
}

/** Bitfield Discord para ocultar el comando en el autocomplete. */
function defaultMemberPermissionsFor(
  def: SystemCommandDefinition,
): string | null {
  const preset = resolveDiscordPermPreset(def);
  switch (preset) {
    case "public":
      return null;
    case "moderation":
      return String(
        PermissionFlagsBits.BanMembers |
          PermissionFlagsBits.KickMembers |
          PermissionFlagsBits.ModerateMembers |
          PermissionFlagsBits.ManageChannels,
      );
    case "manage_guild":
      return String(PermissionFlagsBits.ManageGuild);
    case "administrator":
      return String(PermissionFlagsBits.Administrator);
    default:
      return null;
  }
}

/**
 * Catálogo filtrado por permisos de la guild (`enabled !== false`).
 */
export function listEnabledDefaultCommands(guildId: string) {
  return SYSTEM_COMMAND_CATALOG.filter((def) => {
    const perm = getCommandPermission(guildId, def.name);
    return perm.enabled;
  });
}

/** Cuerpos REST de slash nativos habilitados (+ default_member_permissions). */
export function buildEnabledDefaultSlashBodies(
  guildId: string,
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return listEnabledDefaultCommands(guildId).map((def) => {
    const body = toDiscordSlashCommandBody(def);
    return {
      ...body,
      default_member_permissions: defaultMemberPermissionsFor(def),
    } as RESTPostAPIChatInputApplicationCommandsJSONBody;
  });
}

/**
 * Registra en Discord solo los comandos nativos habilitados.
 * Preferir `syncGuildSlashCommands` para no borrar customs.
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
