import { describe, expect, it } from "vitest";
import { autoRepliesModule } from "./index.js";

describe("auto-replies module", () => {
  it("is named Auto-Replies, no slash, and listens for messageCreate", () => {
    expect(autoRepliesModule.id).toBe("auto-replies");
    expect(autoRepliesModule.name).toBe("Auto-Replies");
    const commands: string[] = [];
    const routes: string[] = [];
    const events: string[] = [];
    autoRepliesModule.register({
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
    expect(routes).toEqual(["/api/auto-replies"]);
    expect(events).toContain("messageCreate");
  });
});
