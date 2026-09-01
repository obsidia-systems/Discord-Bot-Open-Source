import { MODULE_IDS } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { ENABLED_MODULES } from "./index.js";

describe("catálogo ENABLED_MODULES", () => {
  it("todo Lego está en MODULE_IDS de shared", () => {
    for (const mod of ENABLED_MODULES) {
      expect(MODULE_IDS, `falta ${mod.id} en MODULE_IDS`).toContain(mod.id);
    }
  });
});
