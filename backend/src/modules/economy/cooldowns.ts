import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { economyCooldowns } from "../../db/schema.js";
import { EconomyError, formatRemaining } from "./service.js";

/**
 * Lanza si el cooldown sigue activo.
 * @returns ms restantes (0 si disponible).
 */
export function assertCooldownAvailable(
  guildId: string,
  userId: string,
  commandKey: string,
): void {
  const row = getDb()
    .select()
    .from(economyCooldowns)
    .where(
      and(
        eq(economyCooldowns.guildId, guildId),
        eq(economyCooldowns.userId, userId),
        eq(economyCooldowns.commandKey, commandKey),
      ),
    )
    .get();

  if (!row) return;
  const remaining = row.availableAt.getTime() - Date.now();
  if (remaining > 0) {
    throw new EconomyError(
      `Vuelve en ${formatRemaining(remaining)}.`,
      400,
      "COOLDOWN",
    );
  }
}

export function setCooldownMinutes(
  guildId: string,
  userId: string,
  commandKey: string,
  minutes: number,
): void {
  const mins = Math.max(1, Math.floor(minutes));
  setCooldownMs(guildId, userId, commandKey, mins * 60_000);
}

/** Cooldown en milisegundos (mín. 0 = disponible de inmediato). */
export function setCooldownMs(
  guildId: string,
  userId: string,
  commandKey: string,
  ms: number,
): void {
  const delay = Math.max(0, Math.floor(ms));
  if (delay === 0) return;
  const availableAt = new Date(Date.now() + delay);
  getDb()
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
    })
    .run();
}
