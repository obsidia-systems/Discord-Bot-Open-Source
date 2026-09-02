import type { Client } from "discord.js";
import { logger } from "../../core/log.js";
import { endGiveawayNow, startGiveawayMessage } from "./actions.js";
import { listDueToEnd, listDueToStart } from "./service.js";

let botClient: Client | null = null;
const inFlight = new Set<number>();

export function bindGiveawaysScheduler(client: Client): void {
  botClient = client;
}

export async function processDueGiveaways(): Promise<number> {
  const client = botClient;
  if (!client?.isReady()) return 0;
  let processed = 0;
  const dueStart = await listDueToStart();
  for (const snapshot of dueStart) {
    if (inFlight.has(snapshot.id)) continue;
    inFlight.add(snapshot.id);
    try {
      await startGiveawayMessage(client, snapshot.id, snapshot.guildId);
      processed += 1;
    } catch (error: unknown) {
      logger.warn(
        { err: error, id: snapshot.id },
        "giveaways: no se pudo iniciar el sorteo programado",
      );
    } finally {
      inFlight.delete(snapshot.id);
    }
  }
  const dueEnd = await listDueToEnd();
  for (const snapshot of dueEnd) {
    if (inFlight.has(snapshot.id)) continue;
    inFlight.add(snapshot.id);
    try {
      await endGiveawayNow({
        bot: client,
        giveawayId: snapshot.id,
        guildId: snapshot.guildId,
      });
      processed += 1;
    } catch (error: unknown) {
      logger.warn(
        { err: error, id: snapshot.id },
        "giveaways: no se pudo cerrar el sorteo",
      );
    } finally {
      inFlight.delete(snapshot.id);
    }
  }
  return processed;
}
