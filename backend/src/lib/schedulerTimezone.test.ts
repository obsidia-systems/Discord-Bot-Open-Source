import { describe, expect, it } from "vitest";
import {
  timeAndDaysToCron,
  timeAndMonthDayToCron,
  timeAndSpecificDateToCron,
} from "./schedulerTimezone.js";

describe("timeAndDaysToCron", () => {
  it("arma cron diario si no hay días", () => {
    expect(timeAndDaysToCron("18:00", [])).toBe("0 18 * * *");
  });

  it("lista días 0–6 (Dom–Sáb)", () => {
    expect(timeAndDaysToCron("09:30", [1, 3, 5])).toBe("30 9 * * 1,3,5");
  });

  it("rechaza hora inválida", () => {
    expect(timeAndDaysToCron("25:00", [])).toBeNull();
    expect(timeAndDaysToCron("nope", [1])).toBeNull();
  });
});

describe("timeAndMonthDayToCron", () => {
  it("arma m h day * *", () => {
    expect(timeAndMonthDayToCron("18:05", 31)).toBe("5 18 31 * *");
    expect(timeAndMonthDayToCron("00:00", 1)).toBe("0 0 1 * *");
  });

  it("rechaza hora inválida y clamp del día", () => {
    expect(timeAndMonthDayToCron("25:00", 1)).toBeNull();
    expect(timeAndMonthDayToCron("12:00", 99)).toBe("0 12 31 * *");
  });
});

describe("timeAndSpecificDateToCron", () => {
  it("arma m h day month * (anual; el año se filtra aparte)", () => {
    expect(timeAndSpecificDateToCron("18:00", "2026-09-01")).toBe(
      "0 18 1 9 *",
    );
  });

  it("rechaza fecha u hora inválida", () => {
    expect(timeAndSpecificDateToCron("18:00", "2026-13-01")).toBeNull();
    expect(timeAndSpecificDateToCron("nope", "2026-09-01")).toBeNull();
  });
});
