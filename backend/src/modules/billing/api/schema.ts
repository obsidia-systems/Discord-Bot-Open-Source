import { z } from "zod";

export const billingCheckoutSchema = z.object({
  tier: z.enum(["pro", "business"]),
});
