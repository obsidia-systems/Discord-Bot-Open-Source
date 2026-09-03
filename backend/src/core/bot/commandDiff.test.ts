import type {
  ApplicationCommand,
  Collection,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { commandsNeedSync } from "./commandDiff.js";

/** Collection mínima: solo lo que usa `commandsNeedSync` (`size` + `find`). */
function fakeCollection(
  cmds: Array<{ name: string; equals: (body: unknown) => boolean }>,
): Collection<string, ApplicationCommand> {
  return {
    size: cmds.length,
    find(fn: (cmd: unknown) => boolean) {
      return cmds.find((c) => fn(c));
    },
  } as unknown as Collection<string, ApplicationCommand>;
}

const body = (name: string): RESTPostAPIApplicationCommandsJSONBody =>
  ({
    name,
    description: name,
    type: 1,
  }) as RESTPostAPIApplicationCommandsJSONBody;

describe("commandsNeedSync", () => {
  it("true cuando difiere el número de comandos", () => {
    const current = fakeCollection([{ name: "ping", equals: () => true }]);
    expect(commandsNeedSync(current, [body("ping"), body("rank")])).toBe(true);
  });

  it("true cuando falta un comando por nombre", () => {
    const current = fakeCollection([{ name: "ping", equals: () => true }]);
    expect(commandsNeedSync(current, [body("rank")])).toBe(true);
  });

  it("true cuando `equals` reporta un cambio", () => {
    const current = fakeCollection([{ name: "ping", equals: () => false }]);
    expect(commandsNeedSync(current, [body("ping")])).toBe(true);
  });

  it("false cuando todo coincide", () => {
    const current = fakeCollection([
      { name: "ping", equals: () => true },
      { name: "rank", equals: () => true },
    ]);
    expect(commandsNeedSync(current, [body("ping"), body("rank")])).toBe(false);
  });
});
