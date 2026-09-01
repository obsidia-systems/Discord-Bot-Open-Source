import type { AutoModPunishment } from "@adobos/shared";
import { clampTimeoutSeconds } from "../moderation/duration.js";

/** Primera regla cuyo umbral coincide exactamente con el recuento activo. */
export function findPunishmentForWarnCount(
  punishments: AutoModPunishment[],
  activeWarns: number,
): AutoModPunishment | undefined {
  return punishments.find((p) => p.warnThreshold === activeWarns);
}

/** TIMEOUT de Auto Mod guarda ms; executeModAction espera segundos (1 s–28 d). */
export function timeoutMsToSeconds(ms: unknown): number | null {
  return clampTimeoutSeconds(Math.round(Number(ms) / 1000));
}
