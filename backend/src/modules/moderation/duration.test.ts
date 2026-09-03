import { describe, expect, it } from "vitest";
import {
  clampTimeoutSeconds,
  everyoneSendMessagesOverwrite,
  MAX_TIMEOUT_SECONDS,
  parseDurationToSeconds,
} from "./duration.js";

describe("parseDurationToSeconds", () => {
  it("accepts 10m, 1h and 24h", () => {
    expect(parseDurationToSeconds("10m")).toBe(600);
    expect(parseDurationToSeconds("1h")).toBe(3600);
    expect(parseDurationToSeconds("24h")).toBe(86400);
    expect(parseDurationToSeconds("30s")).toBe(30);
  });

  it("rejects garbage", () => {
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds("abc")).toBeNull();
    expect(parseDurationToSeconds("0m")).toBeNull();
  });
});

describe("clampTimeoutSeconds", () => {
  it("accepts 10 minutes (the old whitelist rejected it)", () => {
    expect(clampTimeoutSeconds(600)).toBe(600);
    expect(clampTimeoutSeconds(parseDurationToSeconds("10m"))).toBe(600);
  });

  it("respects Discord's 28-day cap", () => {
    expect(clampTimeoutSeconds(MAX_TIMEOUT_SECONDS)).toBe(MAX_TIMEOUT_SECONDS);
    expect(clampTimeoutSeconds(MAX_TIMEOUT_SECONDS + 1)).toBeNull();
    expect(clampTimeoutSeconds(0)).toBeNull();
  });
});

describe("everyoneSendMessagesOverwrite", () => {
  it("denies SendMessages when locking and inherits it when unlocking", () => {
    expect(everyoneSendMessagesOverwrite(true)).toEqual({
      SendMessages: false,
    });
    expect(everyoneSendMessagesOverwrite(false)).toEqual({
      SendMessages: null,
    });
  });
});
