import { describe, expect, it } from "vitest";
import { starboardModule } from "./module.js";

describe("starboard module", () => {
  it("is named Starboard, no slash, and listens for reactions", () => {
    expect(starboardModule.id).toBe("starboard");
    expect(starboardModule.name).toBe("Starboard");
    const commands: string[] = [];
    const events: string[] = [];
    const routes: string[] = [];
    starboardModule.register({
      client: {} as never,
      on: (event) => {
        events.push(String(event));
      },
      once: () => undefined,
      route: (path) => {
        routes.push(path);
      },
      rawRoute: () => undefined,
      command: (def) => {
        commands.push(def.name);
      },
      autocomplete: () => undefined,
      fallbackChat: () => undefined,
      button: () => undefined,
      select: () => undefined,
      modal: () => undefined,
    });
    expect(commands).toEqual([]);
    expect(routes).toEqual(["/api/starboard"]);
    expect(events).toContain("messageReactionAdd");
    expect(events).toContain("messageReactionRemove");
    expect(events).toContain("messageReactionRemoveAll");
    expect(events).toContain("messageDelete");
    expect(events).toContain("messageDeleteBulk");
  });
});
