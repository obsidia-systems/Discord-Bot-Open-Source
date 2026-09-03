import type { Client } from "discord.js";
import { logger } from "#core/log.js";
import { defineQueue } from "#core/queue/index.js";
import { endGiveawayNow, startGiveawayMessage } from "./actions.js";
import { claimDueGiveaways, clearGiveawayClaim } from "./domain/giveaways.js";

let botClient: Client | null = null;

interface DueJob {
  id: number;
  guildId: string;
  status: string;
}

const queue = defineQueue<DueJob>("giveaways");

export function bindGiveawaysScheduler(client: Client): void {
  botClient = client;
  queue.process((job) => processGiveaway(job));
}

/**
 * Consumidor: arranca (`scheduled`) o cierra (`running`) un sorteo reclamado.
 * En fallo lanza SIN liberar el lease — BullMQ reintenta dentro de la ventana
 * de 2 min; si la agota, el lease expira y el productor lo vuelve a reclamar.
 */
export async function processGiveaway(job: DueJob): Promise<void> {
  const client = botClient;
  if (!client?.isReady()) throw new Error("giveaways: bot no listo");

  if (job.status === "scheduled") {
    await startGiveawayMessage(client, job.id, job.guildId);
  } else {
    await endGiveawayNow({
      bot: client,
      giveawayId: job.id,
      guildId: job.guildId,
    });
  }
  await clearGiveawayClaim(job.id).catch(() => undefined);
}

/** Productor (líder): reclama sorteos que deben arrancar o cerrarse y los encola. */
export async function processDueGiveaways(): Promise<number> {
  if (!botClient?.isReady()) return 0;
  const claimed = await claimDueGiveaways();
  for (const job of claimed) {
    await queue.add(job);
  }
  if (claimed.length > 0) {
    logger.debug({ n: claimed.length }, "giveaways: encolados");
  }
  return claimed.length;
}
