import { describe, expect, it } from "vitest";
import {
  clampTimeoutSeconds,
  everyoneSendMessagesOverwrite,
  MAX_TIMEOUT_SECONDS,
  parseDurationToSeconds,
} from "./duration.js";

describe("parseDurationToSeconds", () => {
  it("acepta 10m, 1h y 24h", () => {
    expect(parseDurationToSeconds("10m")).toBe(600);
    expect(parseDurationToSeconds("1h")).toBe(3600);
    expect(parseDurationToSeconds("24h")).toBe(86400);
    expect(parseDurationToSeconds("30s")).toBe(30);
  });

  it("rechaza basura", () => {
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds("abc")).toBeNull();
    expect(parseDurationToSeconds("0m")).toBeNull();
  });
});

describe("clampTimeoutSeconds", () => {
  it("acepta 10 minutos (el whitelist viejo lo rechazaba)", () => {
    expect(clampTimeoutSeconds(600)).toBe(600);
    expect(clampTimeoutSeconds(parseDurationToSeconds("10m"))).toBe(600);
  });

  it("respeta el tope de 28 días de Discord", () => {
    expect(clampTimeoutSeconds(MAX_TIMEOUT_SECONDS)).toBe(MAX_TIMEOUT_SECONDS);
    expect(clampTimeoutSeconds(MAX_TIMEOUT_SECONDS + 1)).toBeNull();
    expect(clampTimeoutSeconds(0)).toBeNull();
  });
});

describe("everyoneSendMessagesOverwrite", () => {
  it("niega SendMessages al bloquear y lo hereda al desbloquear", () => {
    expect(everyoneSendMessagesOverwrite(true)).toEqual({
      SendMessages: false,
    });
    expect(everyoneSendMessagesOverwrite(false)).toEqual({
      SendMessages: null,
    });
  });
});
