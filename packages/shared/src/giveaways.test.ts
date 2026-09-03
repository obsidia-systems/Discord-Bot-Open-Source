import { describe, expect, it } from "vitest";
import {
  canApplyGiveawayAction,
  canEnterGiveaway,
  clampGiveawayDurationMs,
  clampGiveawayWinnerCount,
  durationMsFromMinutes,
  GIVEAWAY_DURATION_MAX_MS,
  GIVEAWAY_DURATION_MIN_MS,
  GIVEAWAY_JOIN_PREFIX,
  GIVEAWAYS_MAX_RUNNING,
  GIVEAWAYS_MAX_WINNERS,
  giveawayEntryGateReason,
  giveawayRunningBlocked,
  giveawayStatusAfter,
  isGiveawayManager,
  parseGiveawayRecordId,
  pickGiveawayWinners,
} from "./giveaways.js";

describe("state machine", () => {
  it("scheduled → running → ended, and cancel from scheduled/running", () => {
    expect(giveawayStatusAfter("scheduled", "start")).toBe("running");
    expect(giveawayStatusAfter("running", "end")).toBe("ended");
    expect(giveawayStatusAfter("scheduled", "cancel")).toBe("cancelled");
    expect(giveawayStatusAfter("running", "cancel")).toBe("cancelled");
    expect(giveawayStatusAfter("ended", "reroll")).toBe("ended");
  });

  it("rejects illegal transitions", () => {
    expect(giveawayStatusAfter("ended", "end")).toBeNull();
    expect(giveawayStatusAfter("ended", "start")).toBeNull();
    expect(giveawayStatusAfter("cancelled", "reroll")).toBeNull();
    expect(giveawayStatusAfter("running", "reroll")).toBeNull();
    expect(giveawayStatusAfter("scheduled", "end")).toBeNull();
    expect(canApplyGiveawayAction("ended", "reroll")).toBe(true);
    expect(canEnterGiveaway("running")).toBe(true);
    expect(canEnterGiveaway("ended")).toBe(false);
  });
});

describe("caps and duration", () => {
  it("25 running and 1–20 winners", () => {
    expect(giveawayRunningBlocked(GIVEAWAYS_MAX_RUNNING)).toBe(true);
    expect(giveawayRunningBlocked(24)).toBe(false);
    expect(clampGiveawayWinnerCount(0)).toBe(1);
    expect(clampGiveawayWinnerCount(2)).toBe(2);
    expect(clampGiveawayWinnerCount(99)).toBe(GIVEAWAYS_MAX_WINNERS);
  });

  it("duration 1 min–30 days", () => {
    expect(clampGiveawayDurationMs(1000)).toBe(GIVEAWAY_DURATION_MIN_MS);
    expect(durationMsFromMinutes(5)).toBe(5 * 60_000);
    expect(clampGiveawayDurationMs(GIVEAWAY_DURATION_MAX_MS + 1)).toBe(
      GIVEAWAY_DURATION_MAX_MS,
    );
  });
});

describe("eligibility", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");

  it("requires a role and blocks a forbidden role", () => {
    expect(
      giveawayEntryGateReason({
        memberRoleIds: ["a"],
        requiredRoleIds: ["need"],
        blockedRoleIds: [],
        accountCreatedAt: now,
        guildJoinedAt: now,
        minAccountAgeDays: 0,
        minGuildAgeDays: 0,
        now,
      }),
    ).toMatch(/required role/);
    expect(
      giveawayEntryGateReason({
        memberRoleIds: ["need"],
        requiredRoleIds: ["need"],
        blockedRoleIds: [],
        accountCreatedAt: now,
        guildJoinedAt: now,
        minAccountAgeDays: 0,
        minGuildAgeDays: 0,
        now,
      }),
    ).toBeNull();
    expect(
      giveawayEntryGateReason({
        memberRoleIds: ["blocked"],
        requiredRoleIds: [],
        blockedRoleIds: ["blocked"],
        accountCreatedAt: now,
        guildJoinedAt: now,
        minAccountAgeDays: 0,
        minGuildAgeDays: 0,
        now,
      }),
    ).toMatch(/can't enter/);
  });

  it("account age and days in the server", () => {
    const young = new Date(now.getTime() - 2 * 86_400_000);
    expect(
      giveawayEntryGateReason({
        memberRoleIds: [],
        requiredRoleIds: [],
        blockedRoleIds: [],
        accountCreatedAt: young,
        guildJoinedAt: now,
        minAccountAgeDays: 7,
        minGuildAgeDays: 0,
        now,
      }),
    ).toMatch(/account/);
    expect(
      giveawayEntryGateReason({
        memberRoleIds: [],
        requiredRoleIds: [],
        blockedRoleIds: [],
        accountCreatedAt: now,
        guildJoinedAt: young,
        minAccountAgeDays: 0,
        minGuildAgeDays: 10,
        now,
      }),
    ).toMatch(/server/);
  });

  it("Manage Guild or manager role", () => {
    expect(
      isGiveawayManager({
        memberRoleIds: [],
        managerRoleIds: ["m"],
        manageGuild: true,
      }),
    ).toBe(true);
    expect(
      isGiveawayManager({
        memberRoleIds: ["m"],
        managerRoleIds: ["m"],
        manageGuild: false,
      }),
    ).toBe(true);
    expect(
      isGiveawayManager({
        memberRoleIds: ["x"],
        managerRoleIds: ["m"],
        manageGuild: false,
      }),
    ).toBe(false);
  });
});

describe("pickGiveawayWinners", () => {
  it("does not repeat and respects exclude", () => {
    const ids = ["a", "b", "c", "a"];
    const alwaysFirst = () => 0;
    expect(pickGiveawayWinners(ids, 2, [], alwaysFirst)).toEqual(["a", "b"]);
    expect(pickGiveawayWinners(ids, 2, ["a"], alwaysFirst)).toEqual(["b", "c"]);
  });

  it("if there are fewer entries than winners, returns what there is", () => {
    expect(pickGiveawayWinners(["x"], 5, [], () => 0)).toEqual(["x"]);
    expect(pickGiveawayWinners([], 3, [], () => 0)).toEqual([]);
  });

  it("parses the join customId", () => {
    expect(
      parseGiveawayRecordId(`${GIVEAWAY_JOIN_PREFIX}12`, GIVEAWAY_JOIN_PREFIX),
    ).toBe(12);
    expect(
      parseGiveawayRecordId("giveaway_join_abc", GIVEAWAY_JOIN_PREFIX),
    ).toBeNull();
  });
});
