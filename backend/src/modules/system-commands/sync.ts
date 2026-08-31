import type {
  Client,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { PermissionFlagsBits, Routes } from "discord.js";
import {
  SYSTEM_COMMAND_CATALOG,
  resolveDiscordPermPreset,
  toDiscordSlashCommandBody,
  type SystemCommandDefinition,
} from "@adobos/shared";
import {
  createDiscordRest,
  discordApplicationId,
} from "../../core/bot/discordApp.js";
import { getCommandPermission } from "./service.js";

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

function toSlashBody(
  def: SystemCommandDefinition,
): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const body = toDiscordSlashCommandBody(def);
  return {
    ...body,
    default_member_permissions: defaultMemberPermissionsFor(def),
  } as RESTPostAPIChatInputApplicationCommandsJSONBody;
}

/**
 * Catálogo filtrado por permisos de la guild (`enabled !== false`).
 * El registro en Discord es global; esto solo alimenta el panel / guard.
 */
export async function listEnabledDefaultCommands(guildId: string) {
  const enabled: SystemCommandDefinition[] = [];
  for (const def of SYSTEM_COMMAND_CATALOG) {
    const perm = await getCommandPermission(guildId, def.name);
    if (perm.enabled) enabled.push(def);
  }
  return enabled;
}

/** Cuerpos REST de slash nativos habilitados en una guild (panel / compat). */
export async function buildEnabledDefaultSlashBodies(
  guildId: string,
): Promise<RESTPostAPIChatInputApplicationCommandsJSONBody[]> {
  const cmds = await listEnabledDefaultCommands(guildId);
  return cmds.map(toSlashBody);
}

/** Catálogo nativo completo para registro global (enable/disable es el guard). */
export function buildGlobalDefaultSlashBodies(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return SYSTEM_COMMAND_CATALOG.map(toSlashBody);
}

/**
 * Un PUT de aplicación: los nativos viven en global, no por guild.
 * Discord puede tardar hasta ~1 h en propagar el cambio.
 */
export async function syncGlobalCommands(client: Client): Promise<number> {
  const rest = createDiscordRest();
  if (!rest) {
    console.warn(
      "[adobos] system-commands: sin DISCORD_TOKEN — no se sincronizan slash globales.",
    );
    return 0;
  }

  const body = buildGlobalDefaultSlashBodies();
  await rest.put(Routes.applicationCommands(discordApplicationId(client)), {
    body,
  });
  console.log(
    `[adobos] slash sync global (${body.length} nativos)`,
  );
  return body.length;
}

/** @deprecated Usa `syncGlobalCommands`. El guildId ya no registra nativos. */
export async function syncDefaultCommands(
  client: Client,
  _guildId?: string,
): Promise<number> {
  return await syncGlobalCommands(client);
}
