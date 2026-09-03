import { describe, expect, it } from "vitest";
import {
  clampScheduledIntervalMinutes,
  computeNextRunAt,
  daysInMonth,
  defaultScheduledFrequency,
  formatScheduledFrequencySummary,
  isScheduledOneShot,
  normalizeScheduledFrequency,
  normalizeScheduledFrequencyType,
  zonedCivilToUtc,
} from "./scheduled-messages.js";

function utc(iso: string): Date {
  return new Date(iso);
}

describe("normalizeScheduledFrequency", () => {
  it("accepts interval and one-shot aliases", () => {
    expect(normalizeScheduledFrequencyType("intervalo")).toBe("interval");
    expect(normalizeScheduledFrequencyType("one_shot")).toBe("specific_date");
    const freq = normalizeScheduledFrequency({
      type: "interval",
      everyMinutes: 3,
    });
    expect(freq.type).toBe("interval");
    expect(freq.everyMinutes).toBe(15);
    expect(freq.lastDayOfMonth).toBe(false);
  });

  it("clamps the interval", () => {
    expect(clampScheduledIntervalMinutes(14)).toBe(15);
    expect(clampScheduledIntervalMinutes(20_000)).toBe(10_080);
  });
});

describe("formatScheduledFrequencySummary", () => {
  it("summarizes daily, monthly last day and interval", () => {
    const daily = defaultScheduledFrequency();
    expect(formatScheduledFrequencySummary(daily, "UTC")).toBe(
      "Every day at 12:00 (UTC)",
    );
    expect(
      formatScheduledFrequencySummary({
        ...daily,
        type: "monthly",
        lastDayOfMonth: true,
        time: "09:00",
      }),
    ).toBe("The last day of every month at 09:00");
    expect(
      formatScheduledFrequencySummary({
        ...daily,
        type: "interval",
        everyMinutes: 120,
      }),
    ).toBe("Every 2 hours");
    expect(
      formatScheduledFrequencySummary({
        ...daily,
        type: "specific_date",
        date: "2026-09-01",
        time: "18:00",
        repeatYearly: false,
      }),
    ).toBe("On 2026-09-01 at 18:00 (once)");
  });
});

describe("zonedCivilToUtc", () => {
  it("UTC is identity", () => {
    expect(zonedCivilToUtc("UTC", 2026, 9, 1, 18, 0).toISOString()).toBe(
      "2026-09-01T18:00:00.000Z",
    );
  });

  it("America/Mexico_City is UTC-6", () => {
    expect(
      zonedCivilToUtc("America/Mexico_City", 2026, 9, 1, 18, 0).toISOString(),
    ).toBe("2026-09-02T00:00:00.000Z");
  });
});

describe("computeNextRunAt", () => {
  it("daily: catch-up if today's tick already passed and was not sent", () => {
    const freq = normalizeScheduledFrequency({ type: "daily", time: "18:00" });
    const due = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-09-01T18:05:00.000Z"),
      null,
    );
    expect(due?.toISOString()).toBe("2026-09-01T18:00:00.000Z");
  });

  it("daily: next day if already sent today", () => {
    const freq = normalizeScheduledFrequency({ type: "daily", time: "18:00" });
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-09-01T18:05:00.000Z"),
      utc("2026-09-01T18:00:10.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-09-02T18:00:00.000Z");
  });

  it("daily: today's time has not arrived yet", () => {
    const freq = normalizeScheduledFrequency({ type: "daily", time: "18:00" });
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-09-01T17:00:00.000Z"),
      utc("2026-08-31T18:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-09-01T18:00:00.000Z");
  });

  it("one-shot: catch-up if the instant already passed", () => {
    const freq = normalizeScheduledFrequency({
      type: "specific_date",
      date: "2026-09-01",
      time: "18:00",
      repeatYearly: false,
    });
    expect(isScheduledOneShot(freq)).toBe(true);
    const due = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-09-01T18:05:00.000Z"),
      null,
    );
    expect(due?.toISOString()).toBe("2026-09-01T18:00:00.000Z");
  });

  it("one-shot: null if already sent (no yearly zombie)", () => {
    const freq = normalizeScheduledFrequency({
      type: "specific_date",
      date: "2026-09-01",
      time: "18:00",
      repeatYearly: false,
    });
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2027-09-01T18:00:00.000Z"),
      utc("2026-09-01T18:00:00.000Z"),
    );
    expect(next).toBeNull();
  });

  it("yearly: next year if this one already passed", () => {
    const freq = normalizeScheduledFrequency({
      type: "specific_date",
      date: "2026-01-01",
      time: "00:00",
      repeatYearly: true,
    });
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-06-01T00:00:00.000Z"),
      utc("2026-01-01T00:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("monthly 31 is clamped in April", () => {
    const freq = normalizeScheduledFrequency({
      type: "monthly",
      dayOfMonth: 31,
      time: "12:00",
    });
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-04-01T00:00:00.000Z"),
      utc("2026-03-31T12:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-04-30T12:00:00.000Z");
  });

  it("last day of February in a non-leap year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    const freq = normalizeScheduledFrequency({
      type: "monthly",
      lastDayOfMonth: true,
      time: "12:00",
    });
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-02-01T00:00:00.000Z"),
      utc("2026-01-31T12:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });

  it("interval: first fire on enable, then lastSent + N", () => {
    const freq = normalizeScheduledFrequency({
      type: "interval",
      everyMinutes: 120,
    });
    const from = utc("2026-09-01T10:00:00.000Z");
    expect(computeNextRunAt(freq, "UTC", from, null)?.toISOString()).toBe(
      from.toISOString(),
    );
    expect(
      computeNextRunAt(
        freq,
        "UTC",
        utc("2026-09-01T14:05:00.000Z"),
        utc("2026-09-01T10:00:00.000Z"),
      )?.toISOString(),
    ).toBe("2026-09-01T12:00:00.000Z");
  });

  it("weekly Mon/Wed after Monday", () => {
    const freq = normalizeScheduledFrequency({
      type: "weekly",
      time: "09:00",
      days: [1, 3],
    });
    // 2026-09-01 is Tuesday
    const next = computeNextRunAt(
      freq,
      "UTC",
      utc("2026-09-01T10:00:00.000Z"),
      utc("2026-08-31T09:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });
});
