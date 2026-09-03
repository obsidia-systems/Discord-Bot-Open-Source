import { describe, expect, it } from "vitest";
import {
  applyLevelsTokens,
  calculateBaseXPForLevel,
  calculateLevel,
  clampLevelsLevel,
  clampLevelsXp,
  defaultLevelsConfig,
  LEVELS_MAX_LEVEL,
  levelsTemplatePingsUser,
  normalizeLevelUpFormat,
  resolveXpMultiplier,
  xpToAdvanceFromLevel,
} from "./levels.js";

describe("curva Mee6", () => {
  it("level 0→1 is 100 XP; remaining matches the threshold", () => {
    expect(xpToAdvanceFromLevel(0)).toBe(100);
    expect(calculateBaseXPForLevel(1)).toBe(100);
    expect(calculateLevel(0)).toBe(0);
    expect(calculateLevel(99)).toBe(0);
    expect(calculateLevel(100)).toBe(1);
    const xp = 140;
    const level = calculateLevel(xp);
    expect(level).toBe(1);
    const next = calculateBaseXPForLevel(level + 1);
    expect(next - xp).toBe(115);
  });

  it("the ceiling fits in a 32-bit integer", () => {
    const capXp = calculateBaseXPForLevel(LEVELS_MAX_LEVEL);
    expect(capXp).toBeLessThan(2_147_483_647);
    expect(clampLevelsLevel(LEVELS_MAX_LEVEL + 50)).toBe(LEVELS_MAX_LEVEL);
    expect(clampLevelsXp(capXp + 10)).toBe(capXp);
    expect(calculateLevel(capXp)).toBe(LEVELS_MAX_LEVEL);
  });
});

describe("resolveXpMultiplier", () => {
  it("adds role, channel and stream bonuses over the integer base", () => {
    const config = defaultLevelsConfig("g");
    config.xpMultiplier = 1;
    config.customMultipliers = [{ roleId: "1".repeat(17), multiplier: 1.5 }];
    config.customChannelMultipliers = [
      { channelId: "2".repeat(17), multiplier: 2 },
    ];
    config.streamMultiplier = 1.5;
    const role = "1".repeat(17);
    const channel = "2".repeat(17);
    expect(resolveXpMultiplier(config, [role], { channelId: channel })).toBe(
      2.5,
    );
    expect(
      resolveXpMultiplier(config, [role], {
        channelId: channel,
        streaming: true,
      }),
    ).toBe(3);
  });
});

describe("plantilla Levels", () => {
  it("does not split {user} inside {username} and detects ping", () => {
    const out = applyLevelsTokens("Hola {user} ({username}) nv {level}", {
      "{username}": "ada",
      "{user}": "<@1>",
      "{level}": "5",
    });
    expect(out).toBe("Hola <@1> (ada) nv 5");
    expect(levelsTemplatePingsUser("Hola {user}!")).toBe(true);
    expect(levelsTemplatePingsUser("Hola {username}")).toBe(false);
  });

  it("the announcement format is always EMBED", () => {
    expect(normalizeLevelUpFormat("IMAGE")).toBe("EMBED");
    expect(normalizeLevelUpFormat("TEXT")).toBe("EMBED");
  });
});
