/**
 * Preferencia ephemeral por interaction.id (set por el guard, leída por handlers).
 */
const ephemeralByInteraction = new Map<string, boolean>();

export function setInteractionEphemeral(
  interactionId: string,
  ephemeral: boolean,
): void {
  ephemeralByInteraction.set(interactionId, ephemeral);
}

export function peekInteractionEphemeral(
  interactionId: string,
  fallback = true,
): boolean {
  return ephemeralByInteraction.get(interactionId) ?? fallback;
}

export function consumeInteractionEphemeral(
  interactionId: string,
  fallback = true,
): boolean {
  const value = ephemeralByInteraction.get(interactionId);
  ephemeralByInteraction.delete(interactionId);
  return value ?? fallback;
}

export function clearInteractionEphemeral(interactionId: string): void {
  ephemeralByInteraction.delete(interactionId);
}
