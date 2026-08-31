import {
  Routes,
  type Client,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { listSystemCommandNames } from "@adobos/shared";
import {
  createDiscordRest,
  discordApplicationId,
} from "../../core/bot/discordApp.js";
import { listCustomCommands } from "./service.js";
import { logger } from "../../core/log.js";

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new Error("Falta guildId para sincronizar slash commands.");
  }
  return id;
}

/**
 * Bulk-overwrite **solo customs** en el guild.
 * Los nativos van por `syncGlobalCommands`. Este PUT además limpia copias
 * antiguas de nativos que se registraron por guild en Fase 1.
 */
export async function syncGuildSlashCommands(
  client: Client,
  guildId?: string,
): Promise<number> {
  const rest = createDiscordRest();
  if (!rest) {
    logger.warn("custom-commands: sin DISCORD_TOKEN — no se sincronizan slash.");
    return 0;
  }

  const gid = resolveGuildId(guildId);
  const clientId = discordApplicationId(client);
  const reserved = new Set(listSystemCommandNames());
  const customs = await listCustomCommands(gid);

  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = customs
    .filter((c) => !reserved.has(c.name))
    .map((c) => ({
      name: c.name,
      description: c.description.slice(0, 100) || "Comando personalizado",
    }));

  await rest.put(Routes.applicationGuildCommands(clientId, gid), { body });
  logger.info(
    `slash sync guild customs (${body.length}) guild=${gid}`,
  );
  return body.length;
}
