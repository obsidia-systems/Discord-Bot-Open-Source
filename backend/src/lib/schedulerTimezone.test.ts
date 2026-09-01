import { describe, expect, it } from "vitest";
import { timeAndDaysToCron } from "./schedulerTimezone.js";

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
