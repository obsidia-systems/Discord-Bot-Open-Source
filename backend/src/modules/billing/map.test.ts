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
  it("keeps paid statuses", () => {
    expect(normalizeStripeStatus("active")).toBe("active");
    expect(normalizeStripeStatus("trialing")).toBe("trialing");
    expect(normalizeStripeStatus("past_due")).toBe("past_due");
    expect(normalizeStripeStatus("paused")).toBe("paused");
  });

  it("maps cancellations and failures", () => {
    expect(normalizeStripeStatus("canceled")).toBe("canceled");
    expect(normalizeStripeStatus("unpaid")).toBe("unpaid");
    expect(normalizeStripeStatus("incomplete")).toBe("unpaid");
    expect(normalizeStripeStatus("incomplete_expired")).toBe("canceled");
  });
});

describe("isPaidStripeStatus", () => {
  it("includes past_due grace and pause collections", () => {
    expect(isPaidStripeStatus("active")).toBe(true);
    expect(isPaidStripeStatus("trialing")).toBe(true);
    expect(isPaidStripeStatus("past_due")).toBe(true);
    expect(isPaidStripeStatus("paused")).toBe(true);
    expect(isPaidStripeStatus("canceled")).toBe(false);
    expect(isPaidStripeStatus("unpaid")).toBe(false);
  });
});

describe("invoiceSubscriptionId", () => {
  it("prioritizes parent.subscription_details and falls back to the flat field", () => {
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
  it("reads the item (API 2025) and falls back to the subscription field", () => {
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
  it("accepts a string or { id }", () => {
    expect(stripeObjectId("cus_1")).toBe("cus_1");
    expect(stripeObjectId({ id: "sub_1" })).toBe("sub_1");
    expect(stripeObjectId("")).toBeNull();
    expect(stripeObjectId(null)).toBeNull();
  });
});

describe("tierFromPriceId", () => {
  const prices = { pro: "price_pro", business: "price_biz" };

  it("maps price id to a paid plan", () => {
    expect(tierFromPriceId("price_biz", prices)).toBe("business");
    expect(tierFromPriceId("price_pro", prices)).toBe("pro");
  });

  it("returns null if the price is not configured", () => {
    expect(tierFromPriceId("price_other", prices)).toBeNull();
    expect(tierFromPriceId(null, prices)).toBeNull();
  });
});

describe("unixToDate", () => {
  it("converts epoch to Date", () => {
    expect(unixToDate(1_700_000_000)?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
    expect(unixToDate(undefined)).toBeNull();
  });
});

describe("checkout 409", () => {
  it("blocks a guild covered by another paying customer", () => {
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

  it("seats: 3/3 blocks a new one; unlimited does not", () => {
    expect(seatsAtCapacity(3, 3, false)).toBe(true);
    expect(seatsAtCapacity(3, 3, true)).toBe(false);
    expect(seatsAtCapacity(5, -1, false)).toBe(false);
  });
});
