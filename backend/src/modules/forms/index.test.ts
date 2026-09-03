import {
  FORM_ACCEPT_PREFIX,
  FORM_DENY_PREFIX,
  FORM_OPEN_PREFIX,
  FORM_SUBMIT_PREFIX,
} from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { formsModule } from "./index.js";
import { remainingMsFromLast } from "./service.js";

describe("formsModule.register", () => {
  it("registers open/accept/deny and the modal", () => {
    const buttons: string[] = [];
    const modals: string[] = [];
    formsModule.register({
      client: {} as never,
      on: () => undefined,
      once: () => undefined,
      route: () => undefined,
      rawRoute: () => undefined,
      command: () => undefined,
      autocomplete: () => undefined,
      fallbackChat: () => undefined,
      button: (prefix) => {
        buttons.push(prefix);
      },
      modal: (prefix) => {
        modals.push(prefix);
      },
    });
    expect(buttons).toEqual([
      FORM_OPEN_PREFIX,
      FORM_ACCEPT_PREFIX,
      FORM_DENY_PREFIX,
    ]);
    expect(modals).toEqual([FORM_SUBMIT_PREFIX]);
    expect(formsModule.name).toBe("Forms");
  });
});

describe("remainingMsFromLast", () => {
  it("once blocks forever; cooldown 0 does not wait", () => {
    const last = new Date(Date.now() - 1_000);
    expect(remainingMsFromLast(last, "once", 0)).toBe(Number.POSITIVE_INFINITY);
    expect(remainingMsFromLast(last, "cooldown", 0)).toBe(0);
    expect(remainingMsFromLast(null, "once", 10)).toBe(0);
  });
});
