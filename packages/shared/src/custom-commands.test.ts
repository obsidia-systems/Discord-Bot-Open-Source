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

describe("nombre de Custom Command", () => {
  it("normaliza y valida el regex de Discord", () => {
    expect(normalizeCustomCommandName("  Hola Mundo  ")).toBe("hola-mundo");
    expect(isValidCustomCommandName("hola-mundo")).toBe(true);
    expect(isValidCustomCommandName("Hola")).toBe(false);
    expect(isValidCustomCommandName("")).toBe(false);
    expect(isValidCustomCommandName("a".repeat(33))).toBe(false);
  });
});

describe("applyCustomCommandTokens", () => {
  it("reemplaza {user} sin comerse {username}", () => {
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

describe("permisos", () => {
  const base = {
    allowedRoleIds: [] as string[],
    ignoredRoleIds: [] as string[],
    allowedChannelIds: [] as string[],
    ignoredChannelIds: [] as string[],
  };

  it("ignored gana; allowed vacío = todos", () => {
    expect(customCommandPermissionDenial(base, ["1"], "c1")).toBeNull();
    expect(
      customCommandPermissionDenial(
        { ...base, ignoredRoleIds: ["9"] },
        ["9"],
        "c1",
      ),
    ).toMatch(/ignorado/);
    expect(
      customCommandPermissionDenial(
        { ...base, allowedRoleIds: ["2"] },
        ["1"],
        "c1",
      ),
    ).toMatch(/rol permitido/);
  });
});

describe("normalizeCustomCommandOptions", () => {
  it("rellena allowEveryone y args en false", () => {
    const opts = normalizeCustomCommandOptions({});
    expect(opts.allowEveryone).toBe(false);
    expect(opts.acceptText).toBe(false);
    expect(opts.acceptUser).toBe(false);
  });
});
