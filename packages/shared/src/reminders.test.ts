import { describe, expect, it } from "vitest";
import {
  assertRemindDueInRange,
  dueFromDurationSeconds,
  formatRemindDiscordStamp,
  parseRemindDurationSeconds,
  parseRemindWhen,
  REMIND_MAX_SECONDS,
  REMIND_MIN_SECONDS,
  REMIND_PER_GUILD_MAX,
  REMIND_PER_USER_MAX,
  remindersSlashCommandBody,
  sanitizeRemindText,
} from "./reminders.js";

describe("duración /remind in", () => {
  it("suma tokens y default minutos", () => {
    expect(parseRemindDurationSeconds("20m")).toBe(20 * 60);
    expect(parseRemindDurationSeconds("2h30m")).toBe(2 * 3600 + 30 * 60);
    expect(parseRemindDurationSeconds("1d 12h")).toBe(36 * 3600);
    expect(parseRemindDurationSeconds("1w")).toBe(7 * 86400);
    expect(parseRemindDurationSeconds("90")).toBe(90 * 60);
    expect(parseRemindDurationSeconds("2 horas")).toBe(2 * 3600);
    expect(parseRemindDurationSeconds("")).toBe(null);
    expect(parseRemindDurationSeconds("ya")).toBe(null);
  });

  it("rechaza fuera de 1 min–365 d", () => {
    const now = new Date("2026-09-02T18:00:00.000Z");
    expect(dueFromDurationSeconds(30, now)).toBe(null);
    expect(dueFromDurationSeconds(REMIND_MIN_SECONDS, now)?.toISOString()).toBe(
      "2026-09-02T18:01:00.000Z",
    );
    expect(dueFromDurationSeconds(REMIND_MAX_SECONDS + 1, now)).toBe(null);
  });
});

describe("hora /remind at", () => {
  it("HH:mm pasa al día siguiente si ya ocurrió", () => {
    const now = new Date("2026-09-02T18:30:00.000Z");
    const due = parseRemindWhen("18:00", "UTC", now);
    expect(due?.toISOString()).toBe("2026-09-03T18:00:00.000Z");
    const later = parseRemindWhen("19:00", "UTC", now);
    expect(later?.toISOString()).toBe("2026-09-02T19:00:00.000Z");
  });

  it("ISO civil y etiqueta Discord", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(parseRemindWhen("2026-09-03 09:15", "UTC", now)?.toISOString()).toBe(
      "2026-09-03T09:15:00.000Z",
    );
    expect(parseRemindWhen("<t:1788373200:R>", "UTC", now)?.getTime()).toBe(
      1788373200 * 1000,
    );
    expect(assertRemindDueInRange(now, now)).toBe("too_soon");
  });
});

describe("copy y slash", () => {
  it("recorta texto y arma /remind", () => {
    expect(sanitizeRemindText("  hola\n\nmundo  ")).toBe("hola mundo");
    expect(REMIND_PER_USER_MAX).toBe(25);
    expect(REMIND_PER_GUILD_MAX).toBe(200);
    const body = remindersSlashCommandBody();
    expect(body.name).toBe("remind");
    const names = body.options.map((o) => o.name);
    expect(names).toEqual(["in", "at", "list", "cancel"]);
    expect(formatRemindDiscordStamp(new Date(1_000_000_000_000))).toContain(
      "<t:1000000000:R>",
    );
  });
});
