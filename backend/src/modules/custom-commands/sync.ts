import { listSystemCommandNames } from "@adobos/shared";
import {
  type APIApplicationCommandOption,
  ApplicationCommandOptionType,
  type Client,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord.js";
import { commandsNeedSync } from "#core/discord/commandDiff.js";
import {
  createDiscordRest,
  discordApplicationId,
} from "#core/discord/discordApp.js";
import { logger } from "#core/log.js";
import {
  CustomCommandsError,
  listActiveCustomCommands,
} from "./domain/custom-commands.js";

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new CustomCommandsError(
      "Missing guildId to sync slash commands.",
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
      name: "text",
      description: "Extra text for {text}.",
      type: ApplicationCommandOptionType.String,
      required: false,
    });
  }
  if (acceptUser) {
    options.push({
      name: "user",
      description: "User for {target}.",
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
      "The bot has no token to sync slash commands.",
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
    const guild = client.guilds.cache.get(gid);
    const current = await guild?.commands.fetch();
    if (current && !commandsNeedSync(current, body)) {
      logger.info(`custom-commands: sin cambios (${body.length}) guild=${gid}`);
      return body.length;
    }
  } catch (error) {
    logger.warn(
      { err: error },
      `custom-commands: no se pudo comparar, se fuerza el PUT guild=${gid}`,
    );
  }

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, gid), { body });
  } catch (error) {
    logger.warn(
      { err: error },
      `custom-commands: PUT slash failed guild=${gid}`,
    );
    throw new CustomCommandsError(
      "Discord did not update the slash commands. Try Re-sync in a few seconds.",
      502,
      "SYNC_FAILED",
    );
  }
  logger.info(`slash sync guild customs (${body.length}) guild=${gid}`);
  return body.length;
}
