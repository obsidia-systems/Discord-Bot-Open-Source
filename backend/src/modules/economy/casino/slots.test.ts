import { describe, expect, it } from "vitest";
import {
  SLOT_PAIR_MULTIPLIER,
  slotsCredit,
  slotsExpectedReturn,
} from "./slots.js";

describe("slotsExpectedReturn", () => {
  it("casa entre 4% y 12%", () => {
    const rtp = slotsExpectedReturn();
    expect(rtp).toBeGreaterThan(0.88);
    expect(rtp).toBeLessThan(0.96);
  });
});

describe("slotsCredit", () => {
  it("par 1.7x con stake cobrado", () => {
    expect(slotsCredit(100, SLOT_PAIR_MULTIPLIER)).toBe(170);
    expect(slotsCredit(100, 0)).toBe(0);
    expect(slotsCredit(50, 8)).toBe(400);
  });
});
