/** Fallo de la API de Discord (OAuth user token). */
export class DiscordHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "DiscordHttpError";
  }
}
