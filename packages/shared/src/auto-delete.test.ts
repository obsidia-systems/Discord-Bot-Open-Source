import { describe, expect, it } from "vitest";
import {
  AUTO_DELETE_BULK_MAX_AGE_MS,
  AUTO_DELETE_MAX_COUNTDOWN_MS,
  AUTO_DELETE_MAX_RULES,
  clampCountdownDelay,
  delayToMs,
  findAutoDeleteRule,
  isOlderThanBulkWindow,
  messageMatchesAutoDeleteFilter,
  normalizeAutoDeleteMode,
  normalizeScheduledDays,
  normalizeScheduledTime,
} from "./auto-delete.js";

describe("delayToMs and clamp", () => {
  it("converts units and trims to 24h", () => {
    expect(delayToMs(10, "seconds")).toBe(10_000);
    expect(delayToMs(2, "minutes")).toBe(120_000);
    expect(delayToMs(1, "hours")).toBe(3_600_000);
    expect(delayToMs(24, "hours")).toBe(AUTO_DELETE_MAX_COUNTDOWN_MS);
  });

  it("clamp respects the per-unit cap", () => {
    expect(clampCountdownDelay(0, "seconds")).toBe(1);
    expect(clampCountdownDelay(99_999, "hours")).toBe(24);
    expect(clampCountdownDelay(3, "minutes")).toBe(3);
  });
});

describe("messageMatchesAutoDeleteFilter", () => {
  const base = {
    pinned: false,
    authorIsBot: false,
    hasAttachments: false,
    createdTimestamp: Date.now(),
  };

  it("nunca borra anclados", () => {
    expect(
      messageMatchesAutoDeleteFilter({ ...base, pinned: true }, "all"),
    ).toBe(false);
  });

  it("bots_only solo borra bots", () => {
    expect(messageMatchesAutoDeleteFilter(base, "bots_only")).toBe(false);
    expect(
      messageMatchesAutoDeleteFilter(
        { ...base, authorIsBot: true },
        "bots_only",
      ),
    ).toBe(true);
  });

  it("no_attachments skips those with an attachment", () => {
    expect(
      messageMatchesAutoDeleteFilter(
        { ...base, hasAttachments: true },
        "no_attachments",
      ),
    ).toBe(false);
    expect(messageMatchesAutoDeleteFilter(base, "no_attachments")).toBe(true);
  });
});

describe("isOlderThanBulkWindow", () => {
  it("flags messages older than 14 days", () => {
    const now = 1_700_000_000_000;
    expect(
      isOlderThanBulkWindow(now - AUTO_DELETE_BULK_MAX_AGE_MS - 1, now),
    ).toBe(true);
    expect(isOlderThanBulkWindow(now - 60_000, now)).toBe(false);
  });
});

describe("findAutoDeleteRule", () => {
  const rules = [
    {
      channelId: "parent",
      mode: "COUNTDOWN" as const,
      delayValue: 10,
      delayUnit: "seconds" as const,
      scheduledTime: "18:00",
      scheduledDays: [] as const,
      filterType: "all" as const,
    },
  ];

  it("kills the direct channel or the thread's parent", () => {
    expect(findAutoDeleteRule(rules, "parent")?.channelId).toBe("parent");
    expect(findAutoDeleteRule(rules, "thread", "parent")?.channelId).toBe(
      "parent",
    );
    expect(findAutoDeleteRule(rules, "other", "nope")).toBeUndefined();
  });
});

describe("normalizers", () => {
  it("time, days and mode", () => {
    expect(normalizeScheduledTime("9:05")).toBe("09:05");
    expect(normalizeScheduledTime("nope")).toBe("18:00");
    expect(normalizeScheduledDays([1, 1, 8, 0])).toEqual([0, 1]);
    expect(normalizeAutoDeleteMode("HORA")).toBe("SCHEDULED");
    expect(AUTO_DELETE_MAX_RULES).toBe(25);
  });
});
