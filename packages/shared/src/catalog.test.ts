import { describe, expect, it } from "vitest";
import {
  AUTO_MOD_MAX_ALLOWED_LINKS,
  AUTO_MOD_MAX_BANNED_WORDS,
  buildBotInviteUrl,
  calculateBaseXPForLevel,
  calculateLevel,
  defaultAutoModConfig,
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
    expect(MODULE_IDS).toContain("voice-rooms");
    expect(MODULE_IDS).toContain("reminders");
    expect(MODULE_IDS).toContain("starboard");
    expect(MODULE_IDS).toContain("anti-raid");
    expect(MODULE_IDS).toContain("stream-alerts");
    expect(MODULE_IDS).toContain("auto-replies");
    expect(MODULE_IDS).toContain("tickets");
    expect(MODULE_IDS).toContain("giveaways");
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length);
  });

  it("mapea ModuleId a FeatureKey sin cobrar billing", () => {
    expect(MODULE_FEATURE["canvas-events"]).toBe("welcome");
    expect(MODULE_FEATURE["action-logs"]).toBe("logs");
    expect(MODULE_FEATURE["auto-mod"]).toBe("automod");
    expect(MODULE_FEATURE["voice-rooms"]).toBe("voice-rooms");
    expect(MODULE_FEATURE.reminders).toBe("reminders");
    expect(MODULE_FEATURE.starboard).toBe("starboard");
    expect(MODULE_FEATURE["anti-raid"]).toBe("anti-raid");
    expect(MODULE_FEATURE["stream-alerts"]).toBe("stream-alerts");
    expect(MODULE_FEATURE["auto-replies"]).toBe("auto-replies");
    expect(MODULE_FEATURE.tickets).toBe("tickets");
    expect(MODULE_FEATURE.giveaways).toBe("giveaways");
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
  it("free incluye voice-rooms y no branding", () => {
    expect(tierHasFeature("free", "voice-rooms")).toBe(true);
    expect(tierHasFeature("free", "reminders")).toBe(true);
    expect(tierHasFeature("free", "starboard")).toBe(true);
    expect(tierHasFeature("free", "anti-raid")).toBe(true);
    expect(tierHasFeature("free", "stream-alerts")).toBe(true);
    expect(tierHasFeature("free", "auto-replies")).toBe(true);
    expect(tierHasFeature("free", "tickets")).toBe(true);
    expect(tierHasFeature("free", "giveaways")).toBe(true);
    expect(tierHasFeature("free", "antinuke")).toBe(false);
    expect(tierHasFeature("pro", "antinuke")).toBe(true);
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

describe("auto-mod defaults", () => {
  it("warn+DM encendidos y staff skip apagado; listas con tope", () => {
    const config = defaultAutoModConfig("1");
    expect(config.warnOnHit).toBe(true);
    expect(config.dmOnHit).toBe(true);
    expect(config.skipStaff).toBe(false);
    expect(AUTO_MOD_MAX_BANNED_WORDS).toBe(200);
    expect(AUTO_MOD_MAX_ALLOWED_LINKS).toBe(50);
  });
});

describe("invite del bot", () => {
  it("arma la URL de Discord con bot + applications.commands", () => {
    const url = buildBotInviteUrl({
      clientId: "123",
      guildId: "111111111111111111",
    });
    expect(url).toContain("client_id=123");
    expect(url).toContain("scope=bot%20applications.commands");
    expect(url).toContain("guild_id=111111111111111111");
    expect(url).toContain("disable_guild_select=true");
    expect(url).not.toContain("permissions=8");
    const perms = BigInt(new URL(url).searchParams.get("permissions") ?? "0");
    expect(perms & 32n).toBe(32n);
  });
});
