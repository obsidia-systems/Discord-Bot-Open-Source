import { describe, expect, it } from "vitest";
import {
  ADOBOS_NATIVE_RULE_LEGACY_NAMES,
  ADOBOS_NATIVE_RULE_NAMES,
  discordInviteRegexPatterns,
  nativeRuleKeyFromName,
  sliceExemptIds,
  toDiscordKeywordFilter,
} from "./nativeRules.js";

describe("toDiscordKeywordFilter", () => {
  it("trims to 60 chars, ignores short ones and duplicates", () => {
    const long = "x".repeat(80);
    expect(toDiscordKeywordFilter(["ab", "a", long, "AB", "hola"])).toEqual([
      "ab",
      long.slice(0, 60),
      "hola",
    ]);
  });
});

describe("nativeRuleKeyFromName", () => {
  it("only recognizes Adobos rules", () => {
    expect(nativeRuleKeyFromName(ADOBOS_NATIVE_RULE_NAMES.antiInvites)).toBe(
      "antiInvites",
    );
    expect(nativeRuleKeyFromName("Keyword Filter 1")).toBeNull();
  });

  it("still resolves pre-1c-B Spanish rule names so old rules get adopted", () => {
    for (const [legacyName, key] of Object.entries(
      ADOBOS_NATIVE_RULE_LEGACY_NAMES,
    )) {
      expect(nativeRuleKeyFromName(legacyName)).toBe(key);
    }
    expect(nativeRuleKeyFromName("Adobos · Palabras")).toBe("bannedWords");
  });
});

describe("discordInviteRegexPatterns", () => {
  it("fits within Discord's caps (10 patterns, 260 chars)", () => {
    const patterns = discordInviteRegexPatterns();
    expect(patterns.length).toBeLessThanOrEqual(10);
    for (const pattern of patterns) {
      expect(pattern.length).toBeLessThanOrEqual(260);
    }
  });
});

describe("sliceExemptIds", () => {
  it("respects the 20-role cap", () => {
    const ids = Array.from({ length: 25 }, (_, i) => String(i + 1));
    expect(sliceExemptIds(ids, 20)).toHaveLength(20);
  });
});
