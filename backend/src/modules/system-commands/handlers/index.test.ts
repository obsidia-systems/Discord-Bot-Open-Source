import { SYSTEM_COMMAND_CATALOG } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMAND_HANDLERS } from "./index.js";

const MODERATION_COMMANDS = [
  "ban",
  "kick",
  "timeout",
  "untimeout",
  "warn",
  "warns",
  "clearwarns",
  "purge",
  "slowmode",
  "lock",
  "unlock",
] as const;

describe("native slash catalog", () => {
  it("the whole catalog has a handler", () => {
    for (const def of SYSTEM_COMMAND_CATALOG) {
      expect(
        DEFAULT_COMMAND_HANDLERS[def.name],
        `missing handler for /${def.name}`,
      ).toBeTypeOf("function");
    }
  });

  it("the 11 moderation ones are not stubs", () => {
    for (const name of MODERATION_COMMANDS) {
      const handler = DEFAULT_COMMAND_HANDLERS[name];
      expect(handler, `/${name}`).toBeTypeOf("function");
      expect(handler.name).not.toMatch(/stub/i);
    }
  });
});
