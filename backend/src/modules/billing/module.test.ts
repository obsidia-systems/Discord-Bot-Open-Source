import { describe, expect, it } from "vitest";
import { billingModule } from "./module.js";

describe("billing module", () => {
  it("se llama Billing", () => {
    expect(billingModule.id).toBe("billing");
    expect(billingModule.name).toBe("Billing");
  });
});
