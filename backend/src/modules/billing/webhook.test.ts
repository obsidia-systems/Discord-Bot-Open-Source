import Stripe from "stripe";
import { describe, expect, it } from "vitest";

describe("firma de webhook Stripe", () => {
  const stripe = new Stripe("sk_test_adobos_dummy");
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({
    id: "evt_test_signature",
    object: "event",
    type: "ping",
    data: { object: {} },
  });

  it("rechaza una firma inválida", () => {
    expect(() =>
      stripe.webhooks.constructEvent(payload, "t=1,v1=deadbeef", secret),
    ).toThrow(Stripe.errors.StripeSignatureVerificationError);
  });

  it("acepta una firma de prueba válida", () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    const event = stripe.webhooks.constructEvent(payload, header, secret);
    expect(event.id).toBe("evt_test_signature");
    expect(event.type).toBe("ping");
  });
});
