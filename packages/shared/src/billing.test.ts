import { describe, expect, it } from "vitest";
import {
  BILLING_PLAN_PRICES,
  guildCoveredByOtherPayer,
  isPaidSubscriptionStatus,
  isSubscriptionStatus,
  seatsAtCapacity,
  seatsOverLimit,
} from "./billing.js";

describe("precios Billing", () => {
  it("ancla 4,99€ / 14,99€", () => {
    expect(BILLING_PLAN_PRICES.pro.monthlyEur).toBe(4.99);
    expect(BILLING_PLAN_PRICES.pro.label).toBe("4,99€/mes");
    expect(BILLING_PLAN_PRICES.business.monthlyEur).toBe(14.99);
    expect(BILLING_PLAN_PRICES.business.label).toBe("14,99€/mes");
  });
});

describe("paused sigue pagado", () => {
  it("paused es un status de pago", () => {
    expect(isSubscriptionStatus("paused")).toBe(true);
    expect(isPaidSubscriptionStatus("paused")).toBe(true);
    expect(isPaidSubscriptionStatus("canceled")).toBe(false);
  });
});

describe("plazas", () => {
  it("capacidad y exceso post-downgrade", () => {
    expect(seatsAtCapacity(3, 3, false)).toBe(true);
    expect(seatsAtCapacity(2, 3, false)).toBe(false);
    expect(seatsOverLimit(5, 3)).toBe(true);
    expect(seatsOverLimit(3, 3)).toBe(false);
    expect(seatsOverLimit(10, -1)).toBe(false);
  });

  it("409 si otro pagador cubre el guild", () => {
    expect(
      guildCoveredByOtherPayer("u1", { userId: "u2", status: "paused" }),
    ).toBe(true);
  });
});
