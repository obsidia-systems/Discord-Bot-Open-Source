import type { GuildContext, StoredSession } from "../core/auth/types.js";

declare global {
  namespace Express {
    interface Request {
      panelSession?: StoredSession;
      guild?: GuildContext;
      cookies: Record<string, string>;
    }
  }
}

export {};
