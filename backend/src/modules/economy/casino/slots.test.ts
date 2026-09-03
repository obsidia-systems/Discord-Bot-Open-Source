import { describe, expect, it } from "vitest";
import {
  SLOT_PAIR_MULTIPLIER,
  slotsCredit,
  slotsExpectedReturn,
} from "./slots.js";

describe("slotsExpectedReturn", () => {
  it("house edge between 4% and 12%", () => {
    const rtp = slotsExpectedReturn();
    expect(rtp).toBeGreaterThan(0.88);
    expect(rtp).toBeLessThan(0.96);
  });
});

describe("slotsCredit", () => {
  it("pair 1.7x with charged stake", () => {
    expect(slotsCredit(100, SLOT_PAIR_MULTIPLIER)).toBe(170);
    expect(slotsCredit(100, 0)).toBe(0);
    expect(slotsCredit(50, 8)).toBe(400);
  });
});
