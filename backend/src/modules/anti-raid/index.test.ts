import { describe, expect, it } from "vitest";
import { antiRaidModule } from "./index.js";

describe("anti-raid module", () => {
  it("is named Anti-Raid and registers /lockdown + joins + audit", () => {
    expect(antiRaidModule.id).toBe("anti-raid");
    expect(antiRaidModule.name).toBe("Anti-Raid");
    const commands: string[] = [];
    const events: string[] = [];
    const routes: string[] = [];
    antiRaidModule.register({
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
    expect(commands).toEqual(["lockdown"]);
    expect(routes).toEqual(["/api/anti-raid"]);
    expect(events).toContain("guildMemberAdd");
    expect(events).toContain("guildAuditLogEntryCreate");
  });
});
