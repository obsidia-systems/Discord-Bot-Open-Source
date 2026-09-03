import { MODULE_IDS } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { ENABLED_MODULES } from "./index.js";

describe("ENABLED_MODULES catalog", () => {
  it("every Lego is in shared's MODULE_IDS", () => {
    for (const mod of ENABLED_MODULES) {
      expect(MODULE_IDS, `missing ${mod.id} in MODULE_IDS`).toContain(mod.id);
    }
  });
});
