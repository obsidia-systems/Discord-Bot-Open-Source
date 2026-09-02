import { describe, expect, it } from "vitest";
import { welcomeModule } from "./index.js";

describe("welcome module", () => {
  it("se llama Welcome", () => {
    expect(welcomeModule.id).toBe("welcome");
    expect(welcomeModule.name).toBe("Welcome");
  });
});
