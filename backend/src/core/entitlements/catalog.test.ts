import {
  TIER_CATALOG,
  tierHasFeature,
  tierLimit,
  UNLIMITED,
} from "@adobos/shared";
import { describe, expect, it } from "vitest";

describe("entitlements catalog", () => {
  it("free does not include branding", () => {
    expect(tierHasFeature("free", "branding")).toBe(false);
    expect(tierHasFeature("pro", "branding")).toBe(true);
  });

  it("scheduled message limits per plan", () => {
    expect(tierLimit("free", "scheduledMessages")).toBe(25);
    expect(tierLimit("pro", "scheduledMessages")).toBe(500);
    expect(tierLimit("business", "scheduledMessages")).toBe(UNLIMITED);
  });

  it("Stream Alerts limits: 2 on free, unlimited on pro", () => {
    expect(tierLimit("free", "streamAlerts")).toBe(2);
    expect(tierLimit("pro", "streamAlerts")).toBe(UNLIMITED);
    expect(tierLimit("business", "streamAlerts")).toBe(UNLIMITED);
  });

  it("Auto-Replies limits: 25 / 500 / unlimited", () => {
    expect(tierLimit("free", "autoReplies")).toBe(25);
    expect(tierLimit("pro", "autoReplies")).toBe(500);
    expect(tierLimit("business", "autoReplies")).toBe(UNLIMITED);
  });

  it("Custom Commands limits (Discord cap 100)", () => {
    expect(tierLimit("free", "customCommands")).toBe(25);
    expect(tierLimit("pro", "customCommands")).toBe(100);
    expect(tierLimit("business", "customCommands")).toBe(100);
  });

  it("business includes pro features", () => {
    for (const feature of TIER_CATALOG.pro.features) {
      expect(tierHasFeature("business", feature)).toBe(true);
    }
  });
});
