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

  it("no emite si no cambió nada visible", () => {
    expect(diffGuildIdentity(base, { ...base })).toEqual([]);
  });

  it("detecta nombre, vanity e icono", () => {
    const diffs = diffGuildIdentity(base, {
      ...base,
      name: "Tobot",
      vanityURLCode: "tobot",
      icon: "bbb",
    });
    expect(diffs.map((d) => d.name)).toEqual(["Nombre", "Icono", "Vanity"]);
  });
});
