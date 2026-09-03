import { describe, expect, it } from "vitest";
import { clockPartsInZone, isDailyScheduleDue } from "./schedulerTimezone.js";

describe("clockPartsInZone", () => {
  it("reads HH:mm, weekday and a per-minute stamp in the given zone", () => {
    // 2026-09-03 12:30 UTC = jueves (weekday 4)
    const at = new Date("2026-09-03T12:30:00Z");
    expect(clockPartsInZone("UTC", at)).toEqual({
      hm: "12:30",
      weekday: 4,
      stamp: "2026-09-03T12:30",
    });
  });

  it("shifts the wall clock across a day boundary (offset positivo, sin DST)", () => {
    // 2026-09-03 21:00 UTC → 2026-09-04 02:30 en Asia/Kolkata (+5:30, viernes)
    const at = new Date("2026-09-03T21:00:00Z");
    expect(clockPartsInZone("Asia/Kolkata", at)).toEqual({
      hm: "02:30",
      weekday: 5,
      stamp: "2026-09-04T02:30",
    });
  });

  it("uses h23 (medianoche = 00:00, no 24:00)", () => {
    const at = new Date("2026-09-03T00:00:00Z");
    expect(clockPartsInZone("UTC", at).hm).toBe("00:00");
  });
});

describe("isDailyScheduleDue", () => {
  const clock = { hm: "18:00", weekday: 4 }; // jueves 18:00

  it("dispara cuando la hora coincide y no hay días", () => {
    expect(isDailyScheduleDue("18:00", [], clock)).toBe(true);
  });

  it("normaliza `H:mm` sin cero a la izquierda", () => {
    expect(isDailyScheduleDue("18:00", [], { hm: "09:05", weekday: 1 })).toBe(
      false,
    );
    expect(isDailyScheduleDue("9:05", [], { hm: "09:05", weekday: 1 })).toBe(
      true,
    );
  });

  it("respeta la lista de días (0=Dom … 6=Sáb)", () => {
    expect(isDailyScheduleDue("18:00", [1, 3, 4], clock)).toBe(true);
    expect(isDailyScheduleDue("18:00", [1, 3, 5], clock)).toBe(false);
  });

  it("no dispara si la hora no coincide", () => {
    expect(isDailyScheduleDue("18:01", [], clock)).toBe(false);
  });

  it("hora inválida → nunca dispara", () => {
    expect(isDailyScheduleDue("nope", [], clock)).toBe(false);
    expect(isDailyScheduleDue("25:00", [], clock)).toBe(false);
  });
});
