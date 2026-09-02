import { guildCoveredByOtherPayer, seatsAtCapacity } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import {
  invoiceSubscriptionId,
  isPaidStripeStatus,
  normalizeStripeStatus,
  stripeObjectId,
  subscriptionPeriodEndUnix,
  tierFromPriceId,
  unixToDate,
} from "./map.js";

describe("normalizeStripeStatus", () => {
  it("conserva estados de pago", () => {
    expect(normalizeStripeStatus("active")).toBe("active");
    expect(normalizeStripeStatus("trialing")).toBe("trialing");
    expect(normalizeStripeStatus("past_due")).toBe("past_due");
    expect(normalizeStripeStatus("paused")).toBe("paused");
  });

  it("mapea cancelaciones y fallos", () => {
    expect(normalizeStripeStatus("canceled")).toBe("canceled");
    expect(normalizeStripeStatus("unpaid")).toBe("unpaid");
    expect(normalizeStripeStatus("incomplete")).toBe("unpaid");
    expect(normalizeStripeStatus("incomplete_expired")).toBe("canceled");
  });
});

describe("isPaidStripeStatus", () => {
  it("incluye gracia past_due y pause collections", () => {
    expect(isPaidStripeStatus("active")).toBe(true);
    expect(isPaidStripeStatus("trialing")).toBe(true);
    expect(isPaidStripeStatus("past_due")).toBe(true);
    expect(isPaidStripeStatus("paused")).toBe(true);
    expect(isPaidStripeStatus("canceled")).toBe(false);
    expect(isPaidStripeStatus("unpaid")).toBe(false);
  });
});

describe("invoiceSubscriptionId", () => {
  it("prioriza parent.subscription_details y cae al campo plano", () => {
    expect(
      invoiceSubscriptionId({
        parent: { subscription_details: { subscription: "sub_new" } },
        subscription: "sub_old",
      }),
    ).toBe("sub_new");
    expect(invoiceSubscriptionId({ subscription: "sub_old" })).toBe("sub_old");
    expect(
      invoiceSubscriptionId({
        parent: { subscription_details: { subscription: { id: "sub_obj" } } },
      }),
    ).toBe("sub_obj");
    expect(invoiceSubscriptionId({})).toBeNull();
  });
});

describe("subscriptionPeriodEndUnix", () => {
  it("lee el item (API 2025) y cae al campo del subscription", () => {
    expect(
      subscriptionPeriodEndUnix({
        items: { data: [{ current_period_end: 1_700_000_000 }] },
        current_period_end: 1,
      }),
    ).toBe(1_700_000_000);
    expect(subscriptionPeriodEndUnix({ current_period_end: 42 })).toBe(42);
    expect(subscriptionPeriodEndUnix({})).toBeNull();
  });
});

describe("stripeObjectId", () => {
  it("acepta string o { id }", () => {
    expect(stripeObjectId("cus_1")).toBe("cus_1");
    expect(stripeObjectId({ id: "sub_1" })).toBe("sub_1");
    expect(stripeObjectId("")).toBeNull();
    expect(stripeObjectId(null)).toBeNull();
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

describe("checkout 409", () => {
  it("bloquea guild cubierto por otro pagador de pago", () => {
    expect(
      guildCoveredByOtherPayer("buyer", {
        userId: "other",
        status: "active",
      }),
    ).toBe(true);
    expect(
      guildCoveredByOtherPayer("buyer", {
        userId: "buyer",
        status: "active",
      }),
    ).toBe(false);
    expect(
      guildCoveredByOtherPayer("buyer", {
        userId: "other",
        status: "canceled",
      }),
    ).toBe(false);
    expect(guildCoveredByOtherPayer("buyer", null)).toBe(false);
  });

  it("plazas: 3/3 bloquea uno nuevo; ilimitado no", () => {
    expect(seatsAtCapacity(3, 3, false)).toBe(true);
    expect(seatsAtCapacity(3, 3, true)).toBe(false);
    expect(seatsAtCapacity(5, -1, false)).toBe(false);
  });
});
