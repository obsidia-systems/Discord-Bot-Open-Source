import { describe, expect, it } from "vitest";
import { BoundedTtlMap } from "./boundedTtlMap.js";

describe("BoundedTtlMap", () => {
  it("evicts the oldest entry when maxSize is exceeded", () => {
    const map = new BoundedTtlMap<string, number>(2, 60_000);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    expect(map.get("a")).toBeUndefined();
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("expires by TTL", async () => {
    const map = new BoundedTtlMap<string, number>(8, 20);
    map.set("x", 1);
    expect(map.get("x")).toBe(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(map.get("x")).toBeUndefined();
  });
});
