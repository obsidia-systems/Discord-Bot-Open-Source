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
  it("ignora texto normal", () => {
    expect(detectZalgo("hola mundo")).toBe(false);
  });

  it("detona combining marks densos", () => {
    const zalgo = `H${"\u0301".repeat(20)}o${"\u0308".repeat(20)}la`;
    expect(detectZalgo(zalgo)).toBe(true);
  });
});

describe("detectExcessCaps", () => {
  it("respeta longitud mínima y porcentaje", () => {
    expect(detectExcessCaps("HOLA", 70, 8)).toBe(false);
    expect(detectExcessCaps("HOLA MUNDO AQUI", 70, 8)).toBe(true);
    expect(detectExcessCaps("Hola mundo aqui", 70, 8)).toBe(false);
  });
});

describe("detectAntiInvites", () => {
  it("cubre gg, discord.com/invite, ptb, canary y discord.new", () => {
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

  it("ve spoilers, zero-width y leet d1scord", () => {
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
  it("permite CDN de Discord y allowlist; bloquea el resto", () => {
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
  it("usa palabra entera en tokens latinos", () => {
    expect(detectBannedWords("foo bar", ["foo"])).toBe(true);
    expect(detectBannedWords("food bar", ["foo"])).toBe(false);
  });

  it("usa substring si el needle no es solo palabra", () => {
    expect(detectBannedWords("visita foo.bar ahora", ["foo.bar"])).toBe(true);
  });
});

describe("detectTextFlood y menciones", () => {
  it("corta por caracteres y saltos de línea", () => {
    expect(detectTextFlood("corto", 800, 6)).toBe(false);
    expect(detectTextFlood("x".repeat(801), 800, 6)).toBe(true);
    expect(detectTextFlood("a\nb\nc\nd\ne\nf\ng\n", 800, 6)).toBe(true);
  });

  it("menciones superan el límite", () => {
    expect(detectMentionSpam(5, 5)).toBe(false);
    expect(detectMentionSpam(6, 5)).toBe(true);
  });
});

describe("evaluateAutoModFilters", () => {
  it("sin texto no dispara invites; sí cuenta spam de mensajes", () => {
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

  it("prioridad: invite gana a palabras", () => {
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

  it("invite ofuscado en evaluate (spoiler)", () => {
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
  it("desnuda spoilers y zero-width", () => {
    expect(normalizeFilterText("||hola||")).toBe("hola");
    expect(normalizeFilterText("ho\u200Bla")).toBe("hola");
  });
});

describe("trackMessageSpam", () => {
  it("dispara a la quinta ráfaga", () => {
    const guildId = `g-spam-${Date.now()}`;
    const userId = "u-spam";
    expect(trackMessageSpam(guildId, userId, 1_000)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_100)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_200)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_300)).toBe(false);
    expect(trackMessageSpam(guildId, userId, 1_400)).toBe(true);
  });
});
