import { describe, expect, it } from "vitest";
import { economyModule } from "./index.js";
import { EconomyError, parseBankAmountInput } from "./service.js";

describe("economy module", () => {
  it("is named Economy", () => {
    expect(economyModule.id).toBe("economy");
    expect(economyModule.name).toBe("Economy");
  });
});

describe("parseBankAmountInput", () => {
  it("translates all and throws on invalid", () => {
    expect(parseBankAmountInput("todo")).toBe("all");
    expect(parseBankAmountInput("25")).toBe(25);
    try {
      parseBankAmountInput("nope");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EconomyError);
      expect((error as EconomyError).code).toBe("INVALID_AMOUNT");
    }
  });
});
