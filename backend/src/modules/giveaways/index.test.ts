import { describe, expect, it } from "vitest";
import { giveawaysModule } from "./index.js";

describe("giveaways module", () => {
  it("is named Giveaways, no slash, with a button and scheduler", () => {
    expect(giveawaysModule.id).toBe("giveaways");
    expect(giveawaysModule.name).toBe("Giveaways");
    const commands: string[] = [];
    const routes: string[] = [];
    const events: string[] = [];
    const buttons: string[] = [];
    const once: string[] = [];
    giveawaysModule.register({
      client: {} as never,
      on: (event) => {
        events.push(String(event));
      },
      once: (event) => {
        once.push(String(event));
      },
      route: (path) => {
        routes.push(path);
      },
      rawRoute: () => undefined,
      command: (def) => {
        commands.push(def.name);
      },
      autocomplete: () => undefined,
      fallbackChat: () => undefined,
      button: (prefix) => {
        buttons.push(prefix);
      },
      select: () => undefined,
      modal: () => undefined,
    });
    expect(commands).toEqual([]);
    expect(routes).toEqual(["/api/giveaways"]);
    expect(buttons).toContain("giveaway_join_");
    expect(events).toContain("messageDelete");
    expect(events).toContain("channelDelete");
    expect(once).toContain("ready");
  });
});
