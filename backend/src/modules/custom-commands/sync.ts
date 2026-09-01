import { listSystemCommandNames } from "@adobos/shared";
import {
  type APIApplicationCommandOption,
  ApplicationCommandOptionType,
  type Client,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord.js";
import {
  createDiscordRest,
  discordApplicationId,
} from "../../core/bot/discordApp.js";
import { logger } from "../../core/log.js";
import { CustomCommandsError, listActiveCustomCommands } from "./service.js";

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new CustomCommandsError(
      "Falta guildId para sincronizar slash commands.",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

function toSlashBody(
  name: string,
  description: string,
  acceptText: boolean,
  acceptUser: boolean,
): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const options: APIApplicationCommandOption[] = [];
  if (acceptText) {
    options.push({
      name: "texto",
      description: "Texto extra para {text}.",
      type: ApplicationCommandOptionType.String,
      required: false,
    });
  }
  if (acceptUser) {
    options.push({
      name: "usuario",
      description: "Usuario para {target}.",
      type: ApplicationCommandOptionType.User,
      required: false,
    });
  }
  return {
    name,
    description: description.slice(0, 100) || "Custom Command",
    options: options.length > 0 ? options : undefined,
  };
}

/**
 * Bulk-overwrite **solo customs activos** en el guild.
 * Los nativos van por `syncGlobalCommands`.
 */
export async function syncGuildSlashCommands(
  client: Client,
  guildId?: string,
): Promise<number> {
  const rest = createDiscordRest();
  if (!rest) {
    throw new CustomCommandsError(
      "El bot no tiene token para sincronizar slash.",
      503,
      "BOT_NOT_READY",
    );
  }

  const gid = resolveGuildId(guildId);
  const clientId = discordApplicationId(client);
  const reserved = new Set(listSystemCommandNames());
  const customs = await listActiveCustomCommands(gid);

  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = customs
    .filter((c) => !reserved.has(c.name))
    .map((c) =>
      toSlashBody(
        c.name,
        c.description,
        c.options.acceptText,
        c.options.acceptUser,
      ),
    );

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, gid), { body });
  } catch (error) {
    logger.warn(
      { err: error },
      `custom-commands: PUT slash falló guild=${gid}`,
    );
    throw new CustomCommandsError(
      "Discord no actualizó los slash. Intenta Re-sync en unos segundos.",
      502,
      "SYNC_FAILED",
    );
  }
  logger.info(`slash sync guild customs (${body.length}) guild=${gid}`);
  return body.length;
}
