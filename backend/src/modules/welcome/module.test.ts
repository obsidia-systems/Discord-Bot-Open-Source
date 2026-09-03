import { describe, expect, it } from "vitest";
import { welcomeModule } from "./module.js";

describe("welcome module", () => {
  it("se llama Welcome", () => {
    expect(welcomeModule.id).toBe("welcome");
    expect(welcomeModule.name).toBe("Welcome");
  });
});
