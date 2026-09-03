import { describe, expect, it } from "vitest";
import {
  timeAndDaysToCron,
  timeAndMonthDayToCron,
  timeAndSpecificDateToCron,
} from "./schedulerTimezone.js";

describe("timeAndDaysToCron", () => {
  it("builds a daily cron if there are no days", () => {
    expect(timeAndDaysToCron("18:00", [])).toBe("0 18 * * *");
  });

  it("lists days 0–6 (Sun–Sat)", () => {
    expect(timeAndDaysToCron("09:30", [1, 3, 5])).toBe("30 9 * * 1,3,5");
  });

  it("rejects an invalid time", () => {
    expect(timeAndDaysToCron("25:00", [])).toBeNull();
    expect(timeAndDaysToCron("nope", [1])).toBeNull();
  });
});

describe("timeAndMonthDayToCron", () => {
  it("builds m h day * *", () => {
    expect(timeAndMonthDayToCron("18:05", 31)).toBe("5 18 31 * *");
    expect(timeAndMonthDayToCron("00:00", 1)).toBe("0 0 1 * *");
  });

  it("rejects an invalid time and clamps the day", () => {
    expect(timeAndMonthDayToCron("25:00", 1)).toBeNull();
    expect(timeAndMonthDayToCron("12:00", 99)).toBe("0 12 31 * *");
  });
});

describe("timeAndSpecificDateToCron", () => {
  it("builds m h day month * (yearly; the year is filtered separately)", () => {
    expect(timeAndSpecificDateToCron("18:00", "2026-09-01")).toBe("0 18 1 9 *");
  });

  it("rejects an invalid date or time", () => {
    expect(timeAndSpecificDateToCron("18:00", "2026-13-01")).toBeNull();
    expect(timeAndSpecificDateToCron("nope", "2026-09-01")).toBeNull();
  });
});
