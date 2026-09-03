import { defaultAutoModFilters } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import {
  deobfuscateInviteText,
  detectAntiInvites,
  detectAntiLinks,
  detectBannedWords,
  detectExcessCaps,
  detectMentionSpam,
  detectTextFlood,
  detectZalgo,
  evaluateAutoModFilters,
  normalizeFilterText,
  trackMessageSpam,
} from "./filters.js";

const allOff = defaultAutoModFilters();

describe("detectZalgo", () => {
  it("ignores normal text", () => {
    expect(detectZalgo("hola mundo")).toBe(false);
  });

  it("triggers on dense combining marks", () => {
    const zalgo = `H${"\u0301".repeat(20)}o${"\u0308".repeat(20)}la`;
    expect(detectZalgo(zalgo)).toBe(true);
  });
});

describe("detectExcessCaps", () => {
  it("respects minimum length and percentage", () => {
    expect(detectExcessCaps("HOLA", 70, 8)).toBe(false);
    expect(detectExcessCaps("HOLA MUNDO AQUI", 70, 8)).toBe(true);
    expect(detectExcessCaps("Hola mundo aqui", 70, 8)).toBe(false);
  });
});

describe("detectAntiInvites", () => {
  it("covers gg, discord.com/invite, ptb, canary and discord.new", () => {
    expect(detectAntiInvites("entra discord.gg/abc123")).toBe(true);
    expect(detectAntiInvites("https://discord.com/invite/abc")).toBe(true);
    expect(detectAntiInvites("https://discordapp.com/invite/abc")).toBe(true);
    expect(detectAntiInvites("https://ptb.discord.com/invite/abc")).toBe(true);
    expect(detectAntiInvites("https://canary.discord.com/invite/abc")).toBe(
      true,
    );
    expect(detectAntiInvites("https://discord.new/abc")).toBe(true);
    expect(detectAntiInvites("mira https://example.com/invite")).toBe(false);
  });

  it("sees spoilers, zero-width and leet d1scord", () => {
    expect(detectAntiInvites(deobfuscateInviteText("||discord.gg/abc||"))).toBe(
      true,
    );
    expect(
      detectAntiInvites(deobfuscateInviteText("discord.\u200Bgg/abc")),
    ).toBe(true);
    expect(detectAntiInvites(deobfuscateInviteText("d1scord.gg/abc"))).toBe(
      true,
    );
  });
});

describe("detectAntiLinks", () => {
  it("allows Discord CDN and allowlist; blocks the rest", () => {
    const cdn =
      "https://cdn.discordapp.com/attachments/1/2/foto.png";
    expect(detectAntiLinks(cdn, [], [cdn])).toBe(false);
    expect(detectAntiLinks("https://youtube.com/watch?v=1", ["youtube.com"])).toBe(
      false,
    );
    expect(detectAntiLinks("https://evil.example/x", ["youtube.com"])).toBe(
      true,
    );
  });
});

describe("detectBannedWords", () => {
  it("uses whole word on Latin tokens", () => {
    expect(detectBannedWords("foo bar", ["foo"])).toBe(true);
    expect(detectBannedWords("food bar", ["foo"])).toBe(false);
  });

  it("uses substring if the needle is not just a word", () => {
    expect(detectBannedWords("visita foo.bar ahora", ["foo.bar"])).toBe(true);
  });
});

describe("detectTextFlood and mentions", () => {
  it("cuts by characters and line breaks", () => {
    expect(detectTextFlood("corto", 800, 6)).toBe(false);
    expect(detectTextFlood("x".repeat(801), 800, 6)).toBe(true);
    expect(detectTextFlood("a\nb\nc\nd\ne\nf\ng\n", 800, 6)).toBe(true);
  });

  it("mentions exceed the limit", () => {
    expect(detectMentionSpam(5, 5)).toBe(false);
    expect(detectMentionSpam(6, 5)).toBe(true);
  });
});

describe("evaluateAutoModFilters", () => {
  it("no text does not trigger invites; it does count message spam", () => {
    const inviteOnly = {
      ...allOff,
      antiInvites: true,
    };
    expect(
      evaluateAutoModFilters({
        filters: inviteOnly,
        content: "",
        mentionCount: 0,
        guildId: "g-empty-invite",
        userId: "u-empty-invite",
      }),
    ).toBeNull();

    const spamOnly = { ...allOff, messageSpam: true };
    const guildId = `g-empty-spam-${Date.now()}`;
    const userId = "u-empty-spam";
    let hit = null;
    for (let i = 0; i < 5; i++) {
      hit = evaluateAutoModFilters({
        filters: spamOnly,
        content: "",
        mentionCount: 0,
        guildId,
        userId,
      });
    }
    expect(hit?.key).toBe("messageSpam");
  });

  it("priority: invite beats words", () => {
    const hit = evaluateAutoModFilters({
      filters: {
        ...allOff,
        antiInvites: true,
        bannedWordsEnabled: true,
        bannedWords: ["hola"],
      },
      content: "hola discord.gg/abc",
      mentionCount: 0,
      guildId: "g-prio",
      userId: "u-prio",
    });
    expect(hit?.key).toBe("antiInvites");
  });

  it("obfuscated invite in evaluate (spoiler)", () => {
    const hit = evaluateAutoModFilters({
      filters: { ...allOff, antiInvites: true },
      content: "mira ||discord.gg/abc||",
      mentionCount: 0,
      guildId: "g-obf",
      userId: "u-obf",
    });
    expect(hit?.key).toBe("antiInvites");
  });
});

describe("normalizeFilterText", () => {
  it("strips spoilers and zero-width", () => {
    expect(normalizeFilterText("||hola||")).toBe("hola");
    expect(normalizeFilterText("ho\u200Bla")).toBe("hola");
  });
});

describe("trackMessageSpam", () => {
  it("fires on the fifth burst", () => {
    const guildId = `g-spam-${Date.now()}`;
    const userId = "u-spam";
    expect(trackMessageSpam(guildId, userId, 1_000)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_100)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_200)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_300)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_400)).toBe(true);
  });
});
