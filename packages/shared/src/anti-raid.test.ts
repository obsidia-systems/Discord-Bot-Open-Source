import { describe, expect, it } from "vitest";
import {
  ANTI_RAID_JOIN_COUNT_DEFAULT,
  accountAgeTooNew,
  antiRaidLockdownSlashCommandBody,
  decideNewMemberAction,
  defaultNukeThresholds,
  isAntiRaidImmune,
  joinFloodTriggered,
  nukeThresholdExceeded,
  parseUserIdList,
  recordAndCount,
} from "./anti-raid.js";

describe("account age and flood", () => {
  it("flags accounts newer than N days", () => {
    const now = Date.parse("2026-09-02T00:00:00Z");
    const sixDays = now - 6 * 86_400_000;
    const eightDays = now - 8 * 86_400_000;
    expect(accountAgeTooNew(sixDays, 7, now)).toBe(true);
    expect(accountAgeTooNew(eightDays, 7, now)).toBe(false);
  });

  it("triggers flood when the threshold is reached within the window", () => {
    const now = 1_000_000;
    const stamps = [now - 2000, now - 1000, now];
    expect(joinFloodTriggered(stamps, 3, 10_000, now)).toBe(true);
    expect(joinFloodTriggered(stamps, 4, 10_000, now)).toBe(false);
    expect(joinFloodTriggered([now - 20_000], 3, 10_000, now)).toBe(false);
    expect(ANTI_RAID_JOIN_COUNT_DEFAULT).toBe(10);
  });

  it("recordAndCount trims outside the window", () => {
    const now = 50_000;
    const { next, count } = recordAndCount(
      [now - 20_000, now - 1000],
      now,
      10_000,
    );
    expect(next).toEqual([now - 1000, now]);
    expect(count).toBe(2);
  });
});

describe("immunity and verdict", () => {
  it("owner, bot and whitelist are left alone", () => {
    const base = {
      userId: "u",
      ownerId: "owner",
      botId: "bot",
      memberRoleIds: ["r1"],
      whitelistUserIds: ["vip"],
      whitelistRoleIds: ["staff"],
    };
    expect(isAntiRaidImmune({ ...base, userId: "owner" })).toBe(true);
    expect(isAntiRaidImmune({ ...base, userId: "bot" })).toBe(true);
    expect(isAntiRaidImmune({ ...base, userId: "vip" })).toBe(true);
    expect(
      isAntiRaidImmune({ ...base, userId: "u", memberRoleIds: ["staff"] }),
    ).toBe(true);
    expect(isAntiRaidImmune(base)).toBe(false);
  });

  it("lockdown gana; luego edad; luego flood", () => {
    const base = {
      enabled: true,
      immune: false,
      lockdownActive: false,
      lockdownJoinAction: "timeout" as const,
      accountAgeEnabled: true,
      accountTooNew: true,
      accountAgeAction: "kick" as const,
      joinFloodEnabled: true,
      flood: true,
      joinAction: "ban" as const,
    };
    expect(decideNewMemberAction({ ...base, enabled: false })).toBe("allow");
    expect(decideNewMemberAction({ ...base, immune: true })).toBe("allow");
    expect(decideNewMemberAction({ ...base, lockdownActive: true })).toBe(
      "timeout",
    );
    expect(decideNewMemberAction(base)).toBe("kick");
    expect(decideNewMemberAction({ ...base, accountTooNew: false })).toBe(
      "ban",
    );
    expect(
      decideNewMemberAction({
        ...base,
        accountTooNew: false,
        flood: false,
      }),
    ).toBe("allow");
  });
});

describe("nuke and slash", () => {
  it("inclusive threshold and id list", () => {
    expect(nukeThresholdExceeded(3, 3)).toBe(true);
    expect(nukeThresholdExceeded(2, 3)).toBe(false);
    expect(defaultNukeThresholds().botAdd).toBe(2);
    expect(parseUserIdList("111111111111111111, 222222222222222222")).toEqual([
      "111111111111111111",
      "222222222222222222",
    ]);
  });

  it("registers /lockdown on|off|status with Manage Guild", () => {
    const body = antiRaidLockdownSlashCommandBody();
    expect(body.name).toBe("lockdown");
    expect(body.default_member_permissions).toBe("32");
    expect(body.options.map((o) => o.name)).toEqual(["on", "off", "status"]);
  });
});
