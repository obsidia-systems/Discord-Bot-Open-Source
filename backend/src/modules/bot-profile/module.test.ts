import { describe, expect, it } from "vitest";
import { botProfileModule } from "./module.js";

describe("bot-profile module", () => {
  it("se llama Bot Profile", () => {
    expect(botProfileModule.id).toBe("bot-profile");
    expect(botProfileModule.name).toBe("Bot Profile");
  });
});
