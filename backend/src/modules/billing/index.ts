import type { AdobosModule } from "../../core/modules/types.js";
import { billingRoutes } from "./api/routes.js";
import { stripeWebhookHandler } from "./webhook.js";

/** Facturación Stripe. El webhook se registra con rawRoute (body crudo). */
export const billingModule: AdobosModule = {
  id: "billing",
  name: "Billing",
  register(ctx) {
    ctx.rawRoute("post", "/api/billing/webhook", stripeWebhookHandler);
    ctx.route("/api/billing", billingRoutes());
  },
};
