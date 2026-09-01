import { describe, expect, it } from "vitest";
import {
  calculateBaseXPForLevel,
  calculateLevel,
  isValidIanaTimezone,
  KERNEL_ERROR_CODES,
  MODULE_FEATURE,
  MODULE_IDS,
  normalizeScheduledTimezone,
  seatsMaxForTier,
  tierHasFeature,
  UNLIMITED,
  xpToAdvanceFromLevel,
} from "./index.js";

describe("catálogo de módulos", () => {
  it("incluye canvas-events y no duplica ids", () => {
    expect(MODULE_IDS).toContain("canvas-events");
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length);
  });

  it("mapea ModuleId a FeatureKey sin cobrar billing", () => {
    expect(MODULE_FEATURE["canvas-events"]).toBe("welcome");
    expect(MODULE_FEATURE["action-logs"]).toBe("logs");
    expect(MODULE_FEATURE["auto-mod"]).toBe("automod");
    expect(MODULE_FEATURE.billing).toBeUndefined();
  });
});

describe("códigos de error del kernel", () => {
  it("cubre auth, guild y entitlements", () => {
    expect(KERNEL_ERROR_CODES).toContain("UNAUTHENTICATED");
    expect(KERNEL_ERROR_CODES).toContain("GUILD_FORBIDDEN");
    expect(KERNEL_ERROR_CODES).toContain("FEATURE_LOCKED");
    expect(KERNEL_ERROR_CODES).toContain("RATE_LIMITED");
    expect(KERNEL_ERROR_CODES).toContain("STRIPE_INVALID_REQUEST");
  });
});

describe("entitlements y asientos", () => {
  it("free no incluye branding", () => {
    expect(tierHasFeature("free", "branding")).toBe(false);
    expect(tierHasFeature("pro", "branding")).toBe(true);
  });

  it("asientos máximos por plan", () => {
    expect(seatsMaxForTier("free")).toBe(3);
    expect(seatsMaxForTier("pro")).toBe(3);
    expect(seatsMaxForTier("business")).toBe(UNLIMITED);
  });
});

describe("curva de XP", () => {
  it("es estrictamente creciente", () => {
    let prev = calculateBaseXPForLevel(0);
    expect(prev).toBe(0);
    for (let level = 1; level <= 50; level++) {
      const base = calculateBaseXPForLevel(level);
      expect(base).toBeGreaterThan(prev);
      expect(xpToAdvanceFromLevel(level - 1)).toBe(base - prev);
      expect(calculateLevel(base)).toBe(level);
      prev = base;
    }
  });
});

describe("zona IANA", () => {
  it("acepta zonas reales y rechaza basura", () => {
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("America/Mexico_City")).toBe(true);
    expect(isValidIanaTimezone("Not/AZone")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
  });

  it("normaliza inválidas a UTC", () => {
    expect(normalizeScheduledTimezone("garbage")).toBe("UTC");
    expect(normalizeScheduledTimezone("Europe/Madrid")).toBe("Europe/Madrid");
  });
});
