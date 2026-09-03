import { eq, lt } from "drizzle-orm";
import { getDb, one } from "#db/client.js";
import { oauthStates, panelSessions, panelUsers } from "#db/schema.js";
import { encryptSecret, randomToken } from "./crypto.js";
import {
  OAUTH_STATE_TTL_MS,
  type PanelUser,
  SESSION_TTL_MS,
  type StoredSession,
} from "./types.js";

function avatarUrl(userId: string, avatar: string | null): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}`;
}

export function toPanelUser(row: {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}): PanelUser {
  return {
    id: row.userId,
    username: row.username,
    globalName: row.globalName,
    avatar: row.avatar,
    avatarUrl: avatarUrl(row.userId, row.avatar),
  };
}

export async function upsertPanelUser(input: {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}): Promise<void> {
  const existing = await one(
    getDb()
      .select()
      .from(panelUsers)
      .where(eq(panelUsers.userId, input.userId))
      .limit(1),
  );
  const now = new Date();
  if (existing) {
    await getDb()
      .update(panelUsers)
      .set({
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        updatedAt: now,
      })
      .where(eq(panelUsers.userId, input.userId));
    return;
  }
  await getDb().insert(panelUsers).values({
    userId: input.userId,
    username: input.username,
    globalName: input.globalName,
    avatar: input.avatar,
    createdAt: now,
    updatedAt: now,
  });
}

export async function createOauthState(codeVerifier: string): Promise<string> {
  const state = randomToken(32);
  await getDb()
    .insert(oauthStates)
    .values({
      state,
      codeVerifier,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });
  return state;
}

export async function consumeOauthState(state: string): Promise<string | null> {
  const row = await one(
    getDb()
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, state))
      .limit(1),
  );
  if (!row) return null;
  await getDb().delete(oauthStates).where(eq(oauthStates.state, state));
  return takeOauthVerifier(row, Date.now());
}

/** Consume-once: la fila ya se borró; si estaba caducada no vale. */
export function takeOauthVerifier(
  row: { codeVerifier: string; expiresAt: Date },
  nowMs: number,
): string | null {
  if (row.expiresAt.getTime() <= nowMs) return null;
  return row.codeVerifier;
}

export async function createSession(input: {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  accessToken: string;
  refreshToken?: string | null;
  accessExpiresAt?: Date | null;
}): Promise<string> {
  const id = randomToken(32);
  await getDb()
    .insert(panelSessions)
    .values({
      id,
      userId: input.userId,
      accessTokenEnc: encryptSecret(input.accessToken),
      refreshTokenEnc: input.refreshToken
        ? encryptSecret(input.refreshToken)
        : null,
      accessExpiresAt: input.accessExpiresAt ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  return id;
}

export async function updateSessionTokens(
  sessionId: string,
  input: {
    accessToken: string;
    refreshToken?: string | null;
    accessExpiresAt?: Date | null;
  },
): Promise<void> {
  const patch: {
    accessTokenEnc: string;
    refreshTokenEnc?: string | null;
    accessExpiresAt?: Date | null;
  } = {
    accessTokenEnc: encryptSecret(input.accessToken),
  };
  if (input.refreshToken !== undefined) {
    patch.refreshTokenEnc = input.refreshToken
      ? encryptSecret(input.refreshToken)
      : null;
  }
  if (input.accessExpiresAt !== undefined) {
    patch.accessExpiresAt = input.accessExpiresAt;
  }
  await getDb()
    .update(panelSessions)
    .set(patch)
    .where(eq(panelSessions.id, sessionId));
}

export async function getSession(
  sessionId: string,
): Promise<StoredSession | null> {
  const session = await one(
    getDb()
      .select()
      .from(panelSessions)
      .where(eq(panelSessions.id, sessionId))
      .limit(1),
  );
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await getDb()
        .delete(panelSessions)
        .where(eq(panelSessions.id, sessionId));
    }
    return null;
  }
  const user = await one(
    getDb()
      .select()
      .from(panelUsers)
      .where(eq(panelUsers.userId, session.userId))
      .limit(1),
  );
  if (!user) return null;
  return {
    id: session.id,
    userId: user.userId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    accessTokenEnc: session.accessTokenEnc,
    refreshTokenEnc: session.refreshTokenEnc,
    accessExpiresAt: session.accessExpiresAt,
    expiresAt: session.expiresAt,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDb().delete(panelSessions).where(eq(panelSessions.id, sessionId));
}

export async function pruneExpiredSessions(): Promise<void> {
  const now = new Date();
  await getDb().delete(oauthStates).where(lt(oauthStates.expiresAt, now));
  await getDb().delete(panelSessions).where(lt(panelSessions.expiresAt, now));
}

let pruneTimer: ReturnType<typeof setInterval> | null = null;

/** Limpieza periódica; no va en el hot path de getSession. */
export function startSessionPruneJob(): void {
  if (pruneTimer) return;
  void pruneExpiredSessions();
  pruneTimer = setInterval(
    () => {
      void pruneExpiredSessions();
    },
    60 * 60 * 1000,
  );
  pruneTimer.unref();
}

export function stopSessionPruneJob(): void {
  if (!pruneTimer) return;
  clearInterval(pruneTimer);
  pruneTimer = null;
}
