import { createHash, randomBytes } from "node:crypto";
import {
  type CookieOptions,
  type Request,
  type Response,
  Router,
} from "express";
import { DiscordHttpError } from "../bot/discordHttpError.js";
import { logger } from "../log.js";
import { listManagedGuilds } from "./discordGuilds.js";
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession,
  getSession,
  toPanelUser,
  upsertPanelUser,
} from "./sessionStore.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./types.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";

function publicAppUrl(): string {
  const url = process.env.PUBLIC_APP_URL?.trim();
  if (!url) {
    throw new Error("PUBLIC_APP_URL no está definido.");
  }
  return url.replace(/\/$/, "");
}

function redirectUri(): string {
  return `${publicAppUrl()}/auth/discord/callback`;
}

function clientId(): string {
  const id = process.env.DISCORD_CLIENT_ID?.trim();
  if (!id) throw new Error("DISCORD_CLIENT_ID no está definido.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("DISCORD_CLIENT_SECRET no está definido.");
  const botToken = process.env.DISCORD_TOKEN?.trim();
  if (botToken && secret === botToken) {
    throw new Error(
      "DISCORD_CLIENT_SECRET no puede ser el token del bot. Usa OAuth2 → Client Secret en el portal de Discord.",
    );
  }
  return secret;
}

function cookieOptions(): CookieOptions {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function sessionIdFrom(req: Request): string | undefined {
  const raw = req.cookies?.[SESSION_COOKIE];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function authRouter(): Router {
  const router = Router();

  router.get("/discord", async (_req, res) => {
    try {
      const { verifier, challenge } = pkcePair();
      const state = await createOauthState(verifier);
      const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: "identify guilds",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "consent",
      });
      res.redirect(`${DISCORD_AUTHORIZE}?${params.toString()}`);
    } catch (error: unknown) {
      logger.error({ err: error }, "OAuth authorize falló:");
      res.redirect("/login?error=oauth_config");
    }
  });

  router.get("/discord/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const oauthError =
      typeof req.query.error === "string" ? req.query.error : "";

    if (oauthError || !code || !state) {
      res.redirect("/login?error=oauth_denied");
      return;
    }

    const verifier = await consumeOauthState(state);
    if (!verifier) {
      res.redirect("/login?error=oauth_state");
      return;
    }

    try {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId(),
          client_secret: clientSecret(),
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri(),
          code_verifier: verifier,
        }),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        logger.error(
          { detail: [tokenRes.status, detail] },
          "Discord token error:",
        );
        const isClient =
          tokenRes.status === 401 || detail.includes("invalid_client");
        res.redirect(
          `/login?error=${isClient ? "oauth_client" : "oauth_token"}`,
        );
        return;
      }
      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        res.redirect("/login?error=oauth_token");
        return;
      }
      const accessExpiresAt =
        typeof tokenJson.expires_in === "number"
          ? new Date(Date.now() + tokenJson.expires_in * 1000)
          : null;

      const meRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!meRes.ok) {
        res.redirect("/login?error=oauth_user");
        return;
      }
      const me = (await meRes.json()) as {
        id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      };

      await upsertPanelUser({
        userId: me.id,
        username: me.username,
        globalName: me.global_name,
        avatar: me.avatar,
      });
      const sessionId = await createSession({
        userId: me.id,
        username: me.username,
        globalName: me.global_name,
        avatar: me.avatar,
        accessToken,
        refreshToken: tokenJson.refresh_token ?? null,
        accessExpiresAt,
      });
      res.cookie(SESSION_COOKIE, sessionId, cookieOptions());
      res.redirect("/dashboard");
    } catch (error: unknown) {
      logger.error({ err: error }, "OAuth callback falló:");
      res.redirect("/login?error=oauth_callback");
    }
  });

  router.post("/logout", async (req, res) => {
    const sid = sessionIdFrom(req);
    if (sid) await deleteSession(sid);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  router.get("/logout", async (req, res) => {
    const sid = sessionIdFrom(req);
    if (sid) await deleteSession(sid);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.redirect("/login");
  });

  return router;
}

export function meRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const session = req.panelSession;
    if (!session) {
      res
        .status(401)
        .json({ error: "No autenticado.", code: "UNAUTHENTICATED" });
      return;
    }
    try {
      const guilds = await listManagedGuilds(session);
      res.json({
        user: toPanelUser(session),
        guilds,
      });
    } catch (error: unknown) {
      if (error instanceof DiscordHttpError && error.status === 401) {
        res
          .status(401)
          .json({ error: "Sesión expirada.", code: "UNAUTHENTICATED" });
        return;
      }
      if (error instanceof DiscordHttpError && error.status === 429) {
        if (error.retryAfterSec) {
          res.setHeader("Retry-After", String(error.retryAfterSec));
        }
        res.status(429).json({
          error: "Discord está limitando peticiones. Espera un momento.",
          code: "DISCORD_RATE_LIMITED",
        });
        return;
      }
      logger.error({ err: error }, "GET /api/me falló:");
      res.status(502).json({
        error: "No se pudieron cargar tus servidores.",
        code: "DISCORD_GUILDS_FAILED",
      });
    }
  });

  return router;
}

export async function readSessionFromRequest(
  req: Request,
): Promise<Awaited<ReturnType<typeof getSession>>> {
  const sid = sessionIdFrom(req);
  if (!sid) return null;
  return await getSession(sid);
}

export function redirectToLogin(req: Request, res: Response): void {
  const url = req.originalUrl ?? req.path;
  if (url.startsWith("/api")) {
    res.status(401).json({ error: "No autenticado.", code: "UNAUTHENTICATED" });
    return;
  }
  res.redirect("/login");
}
