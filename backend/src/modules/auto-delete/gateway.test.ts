import { AUTO_DELETE_MAX_RULES } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { normalizeAutoDeleteRules } from "./domain/auto-delete.js";
import { registerAutoDeleteListeners } from "./gateway.js";

describe("registerAutoDeleteListeners", () => {
  it("listens for messageCreate", () => {
    const names: string[] = [];
    registerAutoDeleteListeners({
      on: (event) => {
        names.push(String(event));
      },
    });
    expect(names).toEqual(["messageCreate"]);
  });
});

describe("normalizeAutoDeleteRules", () => {
  it("deduplicates channel and trims to the cap", () => {
    const many = Array.from({ length: AUTO_DELETE_MAX_RULES + 5 }, (_, i) => ({
      channelId: String(100000000000000000n + BigInt(i)),
      mode: "COUNTDOWN" as const,
      delayValue: 10,
      delayUnit: "seconds" as const,
      scheduledTime: "18:00",
      scheduledDays: [],
      filterType: "all" as const,
    }));
    const rules = normalizeAutoDeleteRules([
      many[0]!,
      { ...many[0]!, delayValue: 99 },
      ...many.slice(1),
    ]);
    expect(rules).toHaveLength(AUTO_DELETE_MAX_RULES);
    expect(rules[0]?.delayValue).toBe(10);
    expect(new Set(rules.map((r) => r.channelId)).size).toBe(rules.length);
  });
});
