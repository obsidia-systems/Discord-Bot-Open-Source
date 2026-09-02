import { MessageFlags } from "discord.js";

export const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

export function visibility(
  ephemeral: boolean,
): typeof EPHEMERAL | Record<string, never> {
  return ephemeral ? EPHEMERAL : {};
}
