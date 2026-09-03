import { describe, expect, it } from "vitest";
import { rouletteColor } from "./roulette.js";

describe("rouletteColor", () => {
  it("0 is green, 1 red, 2 black", () => {
    expect(rouletteColor(0)).toBe("green");
    expect(rouletteColor(1)).toBe("red");
    expect(rouletteColor(2)).toBe("black");
  });

  it("covers the 18 European reds", () => {
    const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    for (const n of red) expect(rouletteColor(n)).toBe("red");
    expect(rouletteColor(8)).toBe("black");
    expect(rouletteColor(36)).toBe("red");
  });
});
