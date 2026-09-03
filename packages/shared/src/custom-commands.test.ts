import { describe, expect, it } from "vitest";
import {
  applyCustomCommandTokens,
  customCommandAllowedMentions,
  customCommandPermissionDenial,
  customCommandTemplatePingsInvoker,
  isValidCustomCommandName,
  normalizeCustomCommandName,
  normalizeCustomCommandOptions,
} from "./custom-commands.js";

describe("Custom Command name", () => {
  it("normalizes and validates the Discord regex", () => {
    expect(normalizeCustomCommandName("  Hola Mundo  ")).toBe("hola-mundo");
    expect(isValidCustomCommandName("hola-mundo")).toBe(true);
    expect(isValidCustomCommandName("Hola")).toBe(false);
    expect(isValidCustomCommandName("")).toBe(false);
    expect(isValidCustomCommandName("a".repeat(33))).toBe(false);
  });
});

describe("applyCustomCommandTokens", () => {
  it("replaces {user} without eating {username}", () => {
    const out = applyCustomCommandTokens("Hola {user} ({username})", {
      "{username}": "ada",
      "{user}": "<@1>",
    });
    expect(out).toBe("Hola <@1> (ada)");
  });
});

describe("menciones", () => {
  it("{user} pinea; disableMentions apaga todo; everyone es opt-in", () => {
    expect(customCommandTemplatePingsInvoker("Hola {user}!")).toBe(true);
    expect(customCommandTemplatePingsInvoker("Hola {username}")).toBe(false);
    expect(
      customCommandAllowedMentions({
        disableMentions: false,
        allowEveryone: false,
        pingUserIds: ["123456789012345678"],
      }),
    ).toEqual({
      parse: [],
      users: ["123456789012345678"],
      roles: [],
    });
    expect(
      customCommandAllowedMentions({
        disableMentions: true,
        allowEveryone: true,
        pingUserIds: ["123456789012345678"],
      }).users,
    ).toEqual([]);
    expect(
      customCommandAllowedMentions({
        disableMentions: false,
        allowEveryone: true,
        pingUserIds: [],
      }).parse,
    ).toEqual(["everyone"]);
  });
});

describe("permissions", () => {
  const base = {
    allowedRoleIds: [] as string[],
    ignoredRoleIds: [] as string[],
    allowedChannelIds: [] as string[],
    ignoredChannelIds: [] as string[],
  };

  it("ignored wins; empty allowed = everyone", () => {
    expect(customCommandPermissionDenial(base, ["1"], "c1")).toBeNull();
    expect(
      customCommandPermissionDenial(
        { ...base, ignoredRoleIds: ["9"] },
        ["9"],
        "c1",
      ),
    ).toMatch(/ignored role/);
    expect(
      customCommandPermissionDenial(
        { ...base, allowedRoleIds: ["2"] },
        ["1"],
        "c1",
      ),
    ).toMatch(/allowed role/);
  });
});

describe("normalizeCustomCommandOptions", () => {
  it("fills allowEveryone and args as false", () => {
    const opts = normalizeCustomCommandOptions({});
    expect(opts.allowEveryone).toBe(false);
    expect(opts.acceptText).toBe(false);
    expect(opts.acceptUser).toBe(false);
  });
});
