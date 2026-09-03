import { describe, expect, it } from "vitest";
import { REMIND_BUTTON_CANCEL_PREFIX } from "@adobos/shared";
import { remindersModule } from "./index.js";

describe("reminders module", () => {
  it("is named Reminders and registers slash + button + tick", () => {
    expect(remindersModule.id).toBe("reminders");
    expect(remindersModule.name).toBe("Reminders");
    const commands: string[] = [];
    const buttons: string[] = [];
    remindersModule.register({
      client: {} as never,
      on: () => undefined,
      once: () => undefined,
      route: () => undefined,
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
    expect(commands).toEqual(["remind"]);
    expect(buttons).toEqual([REMIND_BUTTON_CANCEL_PREFIX]);
  });
});
