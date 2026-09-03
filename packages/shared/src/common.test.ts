import { describe, expect, it } from "vitest";
import { includeGuildAssetRole, isGuildAssetChannelType } from "./common.js";

describe("Guild Assets catalog", () => {
  it("includes voice and forum; does not trim to text+announcements", () => {
    expect(isGuildAssetChannelType(0)).toBe(true);
    expect(isGuildAssetChannelType(5)).toBe(true);
    expect(isGuildAssetChannelType(2)).toBe(true);
    expect(isGuildAssetChannelType(15)).toBe(true);
    expect(isGuildAssetChannelType(4)).toBe(true);
    expect(isGuildAssetChannelType(13)).toBe(true);
    expect(isGuildAssetChannelType(16)).toBe(false);
  });

  it("@everyone fuera; booster managed entra", () => {
    const guildId = "111";
    expect(
      includeGuildAssetRole({
        id: guildId,
        guildId,
        managed: false,
      }),
    ).toBe(false);
    expect(
      includeGuildAssetRole({
        id: "booster",
        guildId,
        managed: true,
        boosterRoleId: "booster",
      }),
    ).toBe(true);
    expect(
      includeGuildAssetRole({
        id: "bot-role",
        guildId,
        managed: true,
        boosterRoleId: "booster",
      }),
    ).toBe(false);
    expect(
      includeGuildAssetRole({
        id: "member",
        guildId,
        managed: false,
      }),
    ).toBe(true);
  });
});
