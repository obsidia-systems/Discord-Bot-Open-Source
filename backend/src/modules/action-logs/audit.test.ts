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

  it("ignora entradas fuera de la ventana", () => {
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

  it("elige la reciente del target, no una vieja del mismo usuario", () => {
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

  it("no atribuye el audit de otro target", () => {
    const picked = pickRecentAuditEntry(
      [{ targetId: "user-2", createdTimestamp: now - 200 }],
      { targetId: "user-1", now },
    );
    expect(picked).toBeUndefined();
  });

  it("acepta audit sin target si allowMissingTarget (kick de voz)", () => {
    const picked = pickRecentAuditEntry(
      [{ targetId: null, createdTimestamp: now - 200 }],
      { targetId: "user-1", now, allowMissingTarget: true },
    );
    expect(picked?.targetId).toBeNull();
  });
});

describe("caché guildAuditLogEntryCreate", () => {
  it("recuerda por guild+acción+target", () => {
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

describe("hint de borrado del bot", () => {
  it("devuelve al bot como ejecutor y se consume", () => {
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
