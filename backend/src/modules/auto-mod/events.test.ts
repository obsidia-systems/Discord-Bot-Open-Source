import { describe, expect, it } from "vitest";
import { registerAutoModListeners } from "./events.js";

describe("registerAutoModListeners", () => {
  it("listens for create, update and native AutoMod", () => {
    const names: string[] = [];
    registerAutoModListeners({
      on: (event) => {
        names.push(String(event));
      },
    });
    expect(names).toEqual([
      "messageCreate",
      "messageUpdate",
      "autoModerationActionExecution",
    ]);
  });
});
