/**
 * Preferencia ephemeral por interaction.id (set por el guard, leída por handlers).
 * TTL 15 min: el guard escribe en cada comando nativo y muchos handlers no consumen.
 */
const TTL_MS = 15 * 60 * 1000;

const ephemeralByInteraction = new Map<
  string,
  { value: boolean; expiresAt: number }
>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, entry] of ephemeralByInteraction) {
    if (entry.expiresAt <= now) ephemeralByInteraction.delete(id);
  }
}

export function setInteractionEphemeral(
  interactionId: string,
  ephemeral: boolean,
): void {
  pruneExpired();
  ephemeralByInteraction.set(interactionId, {
    value: ephemeral,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function peekInteractionEphemeral(
  interactionId: string,
  fallback = true,
): boolean {
  pruneExpired();
  return ephemeralByInteraction.get(interactionId)?.value ?? fallback;
}

export function consumeInteractionEphemeral(
  interactionId: string,
  fallback = true,
): boolean {
  pruneExpired();
  const entry = ephemeralByInteraction.get(interactionId);
  ephemeralByInteraction.delete(interactionId);
  return entry?.value ?? fallback;
}

export function clearInteractionEphemeral(interactionId: string): void {
  ephemeralByInteraction.delete(interactionId);
}
