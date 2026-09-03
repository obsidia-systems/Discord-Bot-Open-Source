import { describe, expect, it } from "vitest";
import {
  ACTION_LOG_EVENT_KEYS,
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
  normalizeChannelsMapping,
  normalizeRoutingMode,
} from "./action-logs.js";

describe("normalizeRoutingMode", () => {
  it("accepts SIMPLE and ADVANCED", () => {
    expect(normalizeRoutingMode("SIMPLE")).toBe("SIMPLE");
    expect(normalizeRoutingMode("ADVANCED")).toBe("ADVANCED");
  });

  it("migra alias legacy GLOBAL/CATEGORY", () => {
    expect(normalizeRoutingMode("GLOBAL")).toBe("SIMPLE");
    expect(normalizeRoutingMode("CATEGORY")).toBe("ADVANCED");
  });

  it("falls back to SIMPLE if the value is garbage", () => {
    expect(normalizeRoutingMode("nope")).toBe("SIMPLE");
    expect(normalizeRoutingMode(undefined)).toBe("SIMPLE");
  });
});

describe("normalizeChannelsMapping", () => {
  it("includes invites and does not inherit channels", () => {
    const mapped = normalizeChannelsMapping({ channels: "111" });
    expect(mapped.channels).toBe("111");
    expect(mapped.invites).toBeNull();
  });

  it("respects its own invites", () => {
    expect(normalizeChannelsMapping({ invites: "222" }).invites).toBe("222");
  });

  it("migrates legacy server to roles/channels, not to invites", () => {
    const mapped = normalizeChannelsMapping({ server: "333" });
    expect(mapped.roles).toBe("333");
    expect(mapped.channels).toBe("333");
    expect(mapped.invites).toBeNull();
  });
});

describe("event catalog", () => {
  it("defaults cover all keys, including kick/timeout/bulk", () => {
    const enabled = defaultActionLogEnabledEvents();
    const mapping = defaultActionLogChannelsMapping();
    expect(ACTION_LOG_EVENT_KEYS).toContain("memberKick");
    expect(ACTION_LOG_EVENT_KEYS).toContain("memberTimeout");
    expect(ACTION_LOG_EVENT_KEYS).toContain("memberUntimeout");
    expect(ACTION_LOG_EVENT_KEYS).toContain("messageDeleteBulk");
    expect(ACTION_LOG_EVENT_KEYS).toContain("threadCreate");
    expect(ACTION_LOG_EVENT_KEYS).toContain("guildUpdate");
    for (const key of ACTION_LOG_EVENT_KEYS) {
      expect(enabled[key]).toBe(true);
    }
    expect(mapping.invites).toBeNull();
  });
});
