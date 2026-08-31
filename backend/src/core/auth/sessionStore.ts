import { eq, lt } from "drizzle-orm";
import { getDb } from "../../db/client.js";
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

export function upsertPanelUser(input: {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}): void {
  const db = getDb();
  const existing = db
    .select()
    .from(panelUsers)
    .where(eq(panelUsers.userId, input.userId))
    .get();
  const now = new Date();
  if (existing) {
    db.update(panelUsers)
      .set({
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        updatedAt: now,
      })
      .where(eq(panelUsers.userId, input.userId))
      .run();
    return;
  }
  db.insert(panelUsers)
    .values({
      userId: input.userId,
      username: input.username,
      globalName: input.globalName,
      avatar: input.avatar,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function createOauthState(codeVerifier: string): string {
  pruneExpired();
  const state = randomToken(32);
  getDb()
    .insert(oauthStates)
    .values({
      state,
      codeVerifier,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    })
    .run();
  return state;
}

export function consumeOauthState(state: string): string | null {
  pruneExpired();
  const db = getDb();
  const row = db
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.state, state))
    .get();
  if (!row) return null;
  db.delete(oauthStates).where(eq(oauthStates.state, state)).run();
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row.codeVerifier;
}

export function createSession(input: {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  accessToken: string;
}): string {
  pruneExpired();
  const id = randomToken(32);
  getDb()
    .insert(panelSessions)
    .values({
      id,
      userId: input.userId,
      accessTokenEnc: encryptSecret(input.accessToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .run();
  return id;
}

export function getSession(sessionId: string): StoredSession | null {
  pruneExpired();
  const db = getDb();
  const session = db
    .select()
    .from(panelSessions)
    .where(eq(panelSessions.id, sessionId))
    .get();
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      db.delete(panelSessions).where(eq(panelSessions.id, sessionId)).run();
    }
    return null;
  }
  const user = db
    .select()
    .from(panelUsers)
    .where(eq(panelUsers.userId, session.userId))
    .get();
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

export function deleteSession(sessionId: string): void {
  getDb().delete(panelSessions).where(eq(panelSessions.id, sessionId)).run();
}

function pruneExpired(): void {
  const db = getDb();
  const now = new Date();
  db.delete(oauthStates).where(lt(oauthStates.expiresAt, now)).run();
  db.delete(panelSessions).where(lt(panelSessions.expiresAt, now)).run();
}
