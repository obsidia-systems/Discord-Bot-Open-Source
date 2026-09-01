import { describe, expect, it } from "vitest";
import {
  ACTION_LOG_EVENT_KEYS,
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
  normalizeChannelsMapping,
  normalizeRoutingMode,
} from "./action-logs.js";

describe("normalizeRoutingMode", () => {
  it("acepta SIMPLE y ADVANCED", () => {
    expect(normalizeRoutingMode("SIMPLE")).toBe("SIMPLE");
    expect(normalizeRoutingMode("ADVANCED")).toBe("ADVANCED");
  });

  it("migra alias legacy GLOBAL/CATEGORY", () => {
    expect(normalizeRoutingMode("GLOBAL")).toBe("SIMPLE");
    expect(normalizeRoutingMode("CATEGORY")).toBe("ADVANCED");
  });

  it("cae a SIMPLE si el valor es basura", () => {
    expect(normalizeRoutingMode("nope")).toBe("SIMPLE");
    expect(normalizeRoutingMode(undefined)).toBe("SIMPLE");
  });
});

describe("normalizeChannelsMapping", () => {
  it("incluye invites y no hereda channels", () => {
    const mapped = normalizeChannelsMapping({ channels: "111" });
    expect(mapped.channels).toBe("111");
    expect(mapped.invites).toBeNull();
  });

  it("respeta invites propios", () => {
    expect(normalizeChannelsMapping({ invites: "222" }).invites).toBe("222");
  });

  it("migra server legacy a roles/channels, no a invites", () => {
    const mapped = normalizeChannelsMapping({ server: "333" });
    expect(mapped.roles).toBe("333");
    expect(mapped.channels).toBe("333");
    expect(mapped.invites).toBeNull();
  });
});

describe("catálogo de eventos", () => {
  it("defaults cubren todas las keys, incluidas kick/timeout/bulk", () => {
    const enabled = defaultActionLogEnabledEvents();
    const mapping = defaultActionLogChannelsMapping();
    expect(ACTION_LOG_EVENT_KEYS).toContain("memberKick");
    expect(ACTION_LOG_EVENT_KEYS).toContain("memberTimeout");
    expect(ACTION_LOG_EVENT_KEYS).toContain("memberUntimeout");
    expect(ACTION_LOG_EVENT_KEYS).toContain("messageDeleteBulk");
    for (const key of ACTION_LOG_EVENT_KEYS) {
      expect(enabled[key]).toBe(true);
    }
    expect(mapping.invites).toBeNull();
  });
});
