import { AUTO_MOD_DURATION_OPTIONS } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { MAX_TIMEOUT_SECONDS } from "#modules/moderation/duration.js";
import {
  findPunishmentForWarnCount,
  timeoutMsToSeconds,
} from "./punishmentMatch.js";

describe("findPunishmentForWarnCount", () => {
  const rules = [
    { warnThreshold: 3, actionType: "TIMEOUT" as const, actionParam: 600_000 },
    { warnThreshold: 5, actionType: "KICK" as const, actionParam: null },
  ];

  it("matches exactly, not by ≥", () => {
    expect(findPunishmentForWarnCount(rules, 3)?.actionType).toBe("TIMEOUT");
    expect(findPunishmentForWarnCount(rules, 4)).toBeUndefined();
    expect(findPunishmentForWarnCount(rules, 5)?.actionType).toBe("KICK");
  });
});

describe("timeoutMsToSeconds", () => {
  it("converts Auto Mod presets to the 1s–28d range", () => {
    expect(timeoutMsToSeconds(10 * 60 * 1000)).toBe(600);
    expect(timeoutMsToSeconds(AUTO_MOD_DURATION_OPTIONS[0]!.value)).toBe(600);
    expect(timeoutMsToSeconds(0)).toBeNull();
    expect(timeoutMsToSeconds((MAX_TIMEOUT_SECONDS + 1) * 1000)).toBeNull();
  });
});
