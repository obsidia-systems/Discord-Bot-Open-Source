import {
  TIER_CATALOG,
  tierHasFeature,
  tierLimit,
  UNLIMITED,
} from "@adobos/shared";
import { describe, expect, it } from "vitest";

describe("catálogo de entitlements", () => {
  it("free no incluye branding", () => {
    expect(tierHasFeature("free", "branding")).toBe(false);
    expect(tierHasFeature("pro", "branding")).toBe(true);
  });

  it("límites de mensajes programados por plan", () => {
    expect(tierLimit("free", "scheduledMessages")).toBe(25);
    expect(tierLimit("pro", "scheduledMessages")).toBe(500);
    expect(tierLimit("business", "scheduledMessages")).toBe(UNLIMITED);
  });

  it("límites de Stream Alerts: 2 en free, ilimitados en pro", () => {
    expect(tierLimit("free", "streamAlerts")).toBe(2);
    expect(tierLimit("pro", "streamAlerts")).toBe(UNLIMITED);
    expect(tierLimit("business", "streamAlerts")).toBe(UNLIMITED);
  });

  it("límites de Custom Commands (techo Discord 100)", () => {
    expect(tierLimit("free", "customCommands")).toBe(25);
    expect(tierLimit("pro", "customCommands")).toBe(100);
    expect(tierLimit("business", "customCommands")).toBe(100);
  });

  it("business incluye features de pro", () => {
    for (const feature of TIER_CATALOG.pro.features) {
      expect(tierHasFeature("business", feature)).toBe(true);
    }
  });
});
