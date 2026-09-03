import { DiscordHttpError } from "../discord/discordHttpError.js";
import { logger } from "../log.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { deleteSession, updateSessionTokens } from "./sessionStore.js";
import type { StoredSession } from "./types.js";

const DISCORD_API = "https://discord.com/api/v10";

function clientId(): string {
  const id = process.env.DISCORD_CLIENT_ID?.trim();
  if (!id) throw new Error("DISCORD_CLIENT_ID is not defined.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("DISCORD_CLIENT_SECRET is not defined.");
  return secret;
}

async function refreshAccessToken(
  session: StoredSession,
): Promise<string | null> {
  if (!session.refreshTokenEnc) return null;
  const refreshToken = decryptSecret(session.refreshTokenEnc);
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "Discord refresh_token failed");
    return null;
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) return null;
  const accessExpiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;
  await updateSessionTokens(session.id, {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    accessExpiresAt,
  });
  session.accessTokenEnc = encryptSecret(json.access_token);
  if (json.refresh_token) {
    session.refreshTokenEnc = encryptSecret(json.refresh_token);
  }
  return json.access_token;
}

function throwIfLimited(res: Response): void {
  if (res.status !== 429) return;
  const retryAfter = Number(res.headers.get("retry-after") ?? "1");
  throw new DiscordHttpError(
    "Discord is rate limiting requests.",
    429,
    Number.isFinite(retryAfter) ? retryAfter : 1,
  );
}

/** GET autenticado con el token de usuario. Renueva access si Discord responde 401. */
export async function fetchDiscordAsUser(
  session: StoredSession,
  path: string,
): Promise<Response> {
  let res = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `Bearer ${decryptSecret(session.accessTokenEnc)}`,
    },
  });
  throwIfLimited(res);

  if (res.status === 401) {
    const refreshed = await refreshAccessToken(session);
    if (refreshed) {
      res = await fetch(`${DISCORD_API}${path}`, {
        headers: { Authorization: `Bearer ${refreshed}` },
      });
      throwIfLimited(res);
    }
  }

  if (res.status === 401) {
    await deleteSession(session.id);
    throw new DiscordHttpError("Discord session expired.", 401);
  }

  return res;
}
