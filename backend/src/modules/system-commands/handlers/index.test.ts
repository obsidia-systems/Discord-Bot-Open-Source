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

describe("catálogo de slash nativos", () => {
  it("todo el catálogo tiene handler", () => {
    for (const def of SYSTEM_COMMAND_CATALOG) {
      expect(
        DEFAULT_COMMAND_HANDLERS[def.name],
        `falta handler para /${def.name}`,
      ).toBeTypeOf("function");
    }
  });

  it("los 11 de moderación no son stubs", () => {
    for (const name of MODERATION_COMMANDS) {
      const handler = DEFAULT_COMMAND_HANDLERS[name];
      expect(handler, `/${name}`).toBeTypeOf("function");
      expect(handler.name).not.toMatch(/stub/i);
    }
  });
});
