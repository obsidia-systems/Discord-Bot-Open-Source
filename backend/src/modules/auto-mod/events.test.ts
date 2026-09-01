import { describe, expect, it } from "vitest";
import { registerAutoModListeners } from "./events.js";

describe("registerAutoModListeners", () => {
  it("escucha messageCreate y messageUpdate", () => {
    const names: string[] = [];
    registerAutoModListeners({
      on: (event) => {
        names.push(String(event));
      },
    });
    expect(names).toEqual(["messageCreate", "messageUpdate"]);
  });
});
