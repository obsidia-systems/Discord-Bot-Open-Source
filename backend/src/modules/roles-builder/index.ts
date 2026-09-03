import type { AdobosModule } from "#core/modules/types.js";
import { rolesBuilderRoutes } from "./api/routes.js";

export const rolesBuilderModule: AdobosModule = {
  id: "roles-builder",
  name: "Roles Builder",
  register(ctx) {
    ctx.route("/api/roles", rolesBuilderRoutes(ctx.client), {
      feature: "roles-builder",
    });
  },
};
