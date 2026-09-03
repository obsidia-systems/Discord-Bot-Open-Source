import { listSystemCommandNames } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { customCommandsModule } from "./index.js";
import {
  getReservedSlashCommandNames,
  setReservedSlashCommandNames,
} from "./service.js";
import { utcClockParts } from "./variables.js";

describe("custom-commands module", () => {
  it("is named Custom Commands", () => {
    expect(customCommandsModule.id).toBe("custom-commands");
    expect(customCommandsModule.name).toBe("Custom Commands");
  });

  it("reserves the native slash names", () => {
    const names = listSystemCommandNames();
    expect(names.length).toBeGreaterThan(0);
    setReservedSlashCommandNames(names);
    expect(new Set(getReservedSlashCommandNames())).toEqual(
      new Set(names.map((n) => n.trim().toLowerCase())),
    );
  });
});

describe("utcClockParts", () => {
  it("uses UTC, not the process TZ", () => {
    const at = new Date("2026-09-01T18:05:00.000Z");
    const parts = utcClockParts(at);
    expect(parts.time).toBe("18:05");
    expect(parts.date).toBe("01/09/2026");
    expect(parts.datetime).toBe("01/09/2026 18:05");
  });
});
