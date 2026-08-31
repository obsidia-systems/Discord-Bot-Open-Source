import { eq, lt } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import { oauthStates, panelSessions, panelUsers } from "../../db/schema.js";
import { encryptSecret, randomToken } from "./crypto.js";
import {
  OAUTH_STATE_TTL_MS,
  SESSION_TTL_MS,
  type PanelUser,
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
  await getDb()
    .insert(panelUsers)
    .values({
      userId: input.userId,
      username: input.username,
      globalName: input.globalName,
      avatar: input.avatar,
      createdAt: now,
      updatedAt: now,
    });
}

export async function createOauthState(codeVerifier: string): Promise<string> {
  await pruneExpired();
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
  await pruneExpired();
  const row = await one(
    getDb()
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, state))
      .limit(1),
  );
  if (!row) return null;
  await getDb().delete(oauthStates).where(eq(oauthStates.state, state));
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row.codeVerifier;
}

export async function createSession(input: {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  accessToken: string;
}): Promise<string> {
  await pruneExpired();
  const id = randomToken(32);
  await getDb()
    .insert(panelSessions)
    .values({
      id,
      userId: input.userId,
      accessTokenEnc: encryptSecret(input.accessToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  return id;
}

export async function getSession(
  sessionId: string,
): Promise<StoredSession | null> {
  await pruneExpired();
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
    expiresAt: session.expiresAt,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDb().delete(panelSessions).where(eq(panelSessions.id, sessionId));
}

async function pruneExpired(): Promise<void> {
  const now = new Date();
  await getDb().delete(oauthStates).where(lt(oauthStates.expiresAt, now));
  await getDb().delete(panelSessions).where(lt(panelSessions.expiresAt, now));
}
