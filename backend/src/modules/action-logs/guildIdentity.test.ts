import { describe, expect, it } from "vitest";
import { diffGuildIdentity } from "./guildIdentity.js";

describe("diffGuildIdentity", () => {
  const base = {
    name: "Adobos",
    icon: "aaa",
    banner: null,
    splash: null,
    description: null,
    vanityURLCode: null,
  };

  it("does not emit if nothing visible changed", () => {
    expect(diffGuildIdentity(base, { ...base })).toEqual([]);
  });

  it("detects name, vanity and icon", () => {
    const diffs = diffGuildIdentity(base, {
      ...base,
      name: "Tobot",
      vanityURLCode: "tobot",
      icon: "bbb",
    });
    expect(diffs.map((d) => d.name)).toEqual(["Name", "Icon", "Vanity"]);
  });
});
