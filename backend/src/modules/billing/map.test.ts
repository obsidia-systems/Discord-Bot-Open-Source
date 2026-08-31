import { describe, expect, it } from "vitest";
import {
  isPaidStripeStatus,
  normalizeStripeStatus,
  tierFromPriceId,
  unixToDate,
} from "./map.js";

describe("normalizeStripeStatus", () => {
  it("conserva estados de pago", () => {
    expect(normalizeStripeStatus("active")).toBe("active");
    expect(normalizeStripeStatus("trialing")).toBe("trialing");
    expect(normalizeStripeStatus("past_due")).toBe("past_due");
  });

  it("mapea cancelaciones y fallos", () => {
    expect(normalizeStripeStatus("canceled")).toBe("canceled");
    expect(normalizeStripeStatus("unpaid")).toBe("unpaid");
    expect(normalizeStripeStatus("incomplete")).toBe("unpaid");
    expect(normalizeStripeStatus("incomplete_expired")).toBe("canceled");
    expect(normalizeStripeStatus("paused")).toBe("canceled");
  });
});

describe("isPaidStripeStatus", () => {
  it("incluye gracia past_due", () => {
    expect(isPaidStripeStatus("active")).toBe(true);
    expect(isPaidStripeStatus("trialing")).toBe(true);
    expect(isPaidStripeStatus("past_due")).toBe(true);
    expect(isPaidStripeStatus("canceled")).toBe(false);
    expect(isPaidStripeStatus("unpaid")).toBe(false);
  });
});

describe("tierFromPriceId", () => {
  const prices = { pro: "price_pro", business: "price_biz" };

  it("mapea price id a plan de pago", () => {
    expect(tierFromPriceId("price_biz", prices)).toBe("business");
    expect(tierFromPriceId("price_pro", prices)).toBe("pro");
  });

  it("devuelve null si el price no está configurado", () => {
    expect(tierFromPriceId("price_other", prices)).toBeNull();
    expect(tierFromPriceId(null, prices)).toBeNull();
  });
});

describe("unixToDate", () => {
  it("convierte epoch a Date", () => {
    expect(unixToDate(1_700_000_000)?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
    expect(unixToDate(undefined)).toBeNull();
  });
});
