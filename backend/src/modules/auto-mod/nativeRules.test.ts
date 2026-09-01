import { describe, expect, it } from "vitest";
import {
  ADOBOS_NATIVE_RULE_NAMES,
  discordInviteRegexPatterns,
  nativeRuleKeyFromName,
  sliceExemptIds,
  toDiscordKeywordFilter,
} from "./nativeRules.js";

describe("toDiscordKeywordFilter", () => {
  it("recorta a 60 chars, ignora cortas y duplicados", () => {
    const long = "x".repeat(80);
    expect(toDiscordKeywordFilter(["ab", "a", long, "AB", "hola"])).toEqual([
      "ab",
      long.slice(0, 60),
      "hola",
    ]);
  });
});

describe("nativeRuleKeyFromName", () => {
  it("solo reconoce reglas Adobos", () => {
    expect(nativeRuleKeyFromName(ADOBOS_NATIVE_RULE_NAMES.antiInvites)).toBe(
      "antiInvites",
    );
    expect(nativeRuleKeyFromName("Keyword Filter 1")).toBeNull();
  });
});

describe("discordInviteRegexPatterns", () => {
  it("cabe en los topes de Discord (10 patrones, 260 chars)", () => {
    const patterns = discordInviteRegexPatterns();
    expect(patterns.length).toBeLessThanOrEqual(10);
    for (const pattern of patterns) {
      expect(pattern.length).toBeLessThanOrEqual(260);
    }
  });
});

describe("sliceExemptIds", () => {
  it("respeta el tope de 20 roles", () => {
    const ids = Array.from({ length: 25 }, (_, i) => String(i + 1));
    expect(sliceExemptIds(ids, 20)).toHaveLength(20);
  });
});
