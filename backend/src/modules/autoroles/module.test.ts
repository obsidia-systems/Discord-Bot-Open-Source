import { describe, expect, it } from "vitest";
import { autorolesModule } from "./module.js";

describe("autoroles module", () => {
  it("se llama Autoroles", () => {
    expect(autorolesModule.id).toBe("autoroles");
    expect(autorolesModule.name).toBe("Autoroles");
  });
});
