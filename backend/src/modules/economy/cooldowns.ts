import { and, eq } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import { economyCooldowns } from "../../db/schema.js";
import { EconomyError, formatRemaining } from "./service.js";

/**
 * Lanza si el cooldown sigue activo.
 * @returns ms restantes (0 si disponible).
 */
export async function assertCooldownAvailable(
  guildId: string,
  userId: string,
  commandKey: string,
): Promise<void> {
  const row = await one(
    getDb()
      .select()
      .from(economyCooldowns)
      .where(
        and(
          eq(economyCooldowns.guildId, guildId),
          eq(economyCooldowns.userId, userId),
          eq(economyCooldowns.commandKey, commandKey),
        ),
      )
      .limit(1),
  );

  if (!row) return;
  const remaining = row.availableAt.getTime() - Date.now();
  if (remaining > 0) {
    throw new EconomyError(
      `Come back in ${formatRemaining(remaining)}.`,
      400,
      "COOLDOWN",
    );
  }
}

export async function setCooldownMinutes(
  guildId: string,
  userId: string,
  commandKey: string,
  minutes: number,
): Promise<void> {
  const mins = Math.max(1, Math.floor(minutes));
  await setCooldownMs(guildId, userId, commandKey, mins * 60_000);
}

/** Cooldown en milisegundos (mín. 0 = disponible de inmediato). */
export async function setCooldownMs(
  guildId: string,
  userId: string,
  commandKey: string,
  ms: number,
): Promise<void> {
  const delay = Math.max(0, Math.floor(ms));
  if (delay === 0) return;
  const availableAt = new Date(Date.now() + delay);
  await getDb()
    .insert(economyCooldowns)
    .values({
      guildId,
      userId,
      commandKey,
      availableAt,
    })
    .onConflictDoUpdate({
      target: [
        economyCooldowns.guildId,
        economyCooldowns.userId,
        economyCooldowns.commandKey,
      ],
      set: { availableAt },
    });
}
