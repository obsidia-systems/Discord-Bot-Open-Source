/** Tope nativo de Discord: communication_disabled_until, 28 días. */
export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

/** Parsea duraciones tipo 10m, 1h, 24h, 30s → segundos. */
export function parseDurationToSeconds(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  const match = /^(\d+)\s*(s|m|h|d|seg|min|hora|horas|dia|días|dias)?$/.exec(
    trimmed,
  );
  if (!match) return null;
  const amount = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(amount) || amount < 1) return null;
  const unit = match[2] ?? "m";
  switch (unit) {
    case "s":
    case "seg":
      return amount;
    case "m":
    case "min":
      return amount * 60;
    case "h":
    case "hora":
    case "horas":
      return amount * 3600;
    case "d":
    case "dia":
    case "días":
    case "dias":
      return amount * 86400;
    default:
      return amount * 60;
  }
}

/** 1 s … 28 d. Fuera de rango → null. */
export function clampTimeoutSeconds(value: unknown): number | null {
  const seconds = Math.round(Number(value) || 0);
  if (seconds < 1 || seconds > MAX_TIMEOUT_SECONDS) return null;
  return seconds;
}

/** Overwrite de @everyone para lock/unlock de un canal de texto. */
export function everyoneSendMessagesOverwrite(locked: boolean): {
  SendMessages: false | null;
} {
  return { SendMessages: locked ? false : null };
}
