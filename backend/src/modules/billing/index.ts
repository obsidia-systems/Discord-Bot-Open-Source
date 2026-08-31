import type { AdobosModule } from "../../core/modules/types.js";
import { billingRoutes } from "./api/routes.js";

/** Facturación Stripe. El webhook se monta en createApp (body crudo). */
export const billingModule: AdobosModule = {
  id: "billing",
  name: "Billing",
  register(ctx) {
    ctx.route("/api/billing", billingRoutes());
  },
};
