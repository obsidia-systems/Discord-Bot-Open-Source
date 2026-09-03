import { describe, expect, it } from "vitest";
import { levelsModule } from "./index.js";
import {
  applyLevelsTokens,
  calculateBaseXPForLevel,
  calculateLevel,
  resolveXpMultiplier,
  defaultLevelsConfig,
} from "@adobos/shared";

describe("levels module", () => {
  it("is named Levels", () => {
    expect(levelsModule.id).toBe("levels");
    expect(levelsModule.name).toBe("Levels");
  });
});

describe("grant math (shared)", () => {
  it("flooring the multiplier yields integer XP", () => {
    const config = defaultLevelsConfig("g");
    config.xpMultiplier = 1;
    config.customMultipliers = [{ roleId: "1".repeat(17), multiplier: 1.5 }];
    const mult = resolveXpMultiplier(config, ["1".repeat(17)]);
    expect(Math.floor(20 * mult)).toBe(30);
    expect(calculateLevel(calculateBaseXPForLevel(5))).toBe(5);
    expect(applyLevelsTokens("{user} nv {level}", {
      "{user}": "<@9>",
      "{level}": "3",
    })).toBe("<@9> nv 3");
  });
});
