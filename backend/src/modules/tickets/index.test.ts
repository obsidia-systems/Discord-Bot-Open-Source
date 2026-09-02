import { describe, expect, it } from "vitest";
import { ticketsModule } from "./index.js";

describe("tickets module", () => {
  it("se llama Tickets, sin slash, con botones, modales y channelDelete", () => {
    expect(ticketsModule.id).toBe("tickets");
    expect(ticketsModule.name).toBe("Tickets");
    const commands: string[] = [];
    const routes: string[] = [];
    const events: string[] = [];
    const buttons: string[] = [];
    const modals: string[] = [];
    ticketsModule.register({
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
      button: (prefix) => {
        buttons.push(prefix);
      },
      select: () => undefined,
      modal: (prefix) => {
        modals.push(prefix);
      },
    });
    expect(commands).toEqual([]);
    expect(routes).toEqual(["/api/tickets"]);
    expect(events).toContain("channelDelete");
    expect(events).toContain("messageCreate");
    expect(buttons.some((id) => id.startsWith("ticket_open_"))).toBe(true);
    expect(buttons).toContain("ticket_claim_");
    expect(modals).toContain("ticket_reason_");
  });
});
