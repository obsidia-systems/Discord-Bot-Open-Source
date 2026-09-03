import { describe, expect, it } from "vitest";
import {
  AUDIT_RECENCY_MS,
  clearAuditCache,
  getCachedAuditEntry,
  pickRecentAuditEntry,
  rememberAuditEntry,
  rememberBotMessageDeletes,
  takeBotMessageDelete,
} from "./audit.js";

describe("pickRecentAuditEntry", () => {
  const now = 1_700_000_000_000;

  it("ignores entries outside the window", () => {
    const picked = pickRecentAuditEntry(
      [
        {
          targetId: "user-1",
          createdTimestamp: now - AUDIT_RECENCY_MS - 1,
        },
      ],
      { targetId: "user-1", now },
    );
    expect(picked).toBeUndefined();
  });

  it("picks the recent one for the target, not an old one from the same user", () => {
    const picked = pickRecentAuditEntry(
      [
        {
          targetId: "user-1",
          createdTimestamp: now - 60_000,
        },
        {
          targetId: "user-1",
          createdTimestamp: now - 400,
        },
      ],
      { targetId: "user-1", now },
    );
    expect(picked?.createdTimestamp).toBe(now - 400);
  });

  it("does not attribute another target's audit", () => {
    const picked = pickRecentAuditEntry(
      [{ targetId: "user-2", createdTimestamp: now - 200 }],
      { targetId: "user-1", now },
    );
    expect(picked).toBeUndefined();
  });

  it("accepts audit without target if allowMissingTarget (voice kick)", () => {
    const picked = pickRecentAuditEntry(
      [{ targetId: null, createdTimestamp: now - 200 }],
      { targetId: "user-1", now, allowMissingTarget: true },
    );
    expect(picked?.targetId).toBeNull();
  });
});

describe("guildAuditLogEntryCreate cache", () => {
  it("remembers by guild+action+target", () => {
    clearAuditCache();
    rememberAuditEntry({
      guildId: "g1",
      action: 20,
      targetId: "u1",
      createdTimestamp: Date.now(),
      executor: { id: "mod", tag: "mod#0", bot: false, avatarURL: null },
    });
    const cached = getCachedAuditEntry("g1", 20, "u1");
    expect(cached?.executor?.id).toBe("mod");
    clearAuditCache();
  });
});

describe("bot delete hint", () => {
  it("returns the bot as executor and is consumed", () => {
    clearAuditCache();
    const client = {
      user: {
        id: "bot-1",
        tag: "Adobos#0",
        username: "Adobos",
        bot: true,
        displayAvatarURL: () => "https://cdn.example/bot.png",
      },
    } as unknown as import("discord.js").Client;
    rememberBotMessageDeletes(client, "g1", ["m1"]);
    const hint = takeBotMessageDelete("g1", "m1");
    expect(hint?.executor.id).toBe("bot-1");
    expect(hint?.source).toBe("auto-delete");
    expect(takeBotMessageDelete("g1", "m1")).toBeUndefined();
    clearAuditCache();
  });
});
