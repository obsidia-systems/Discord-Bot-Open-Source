import { describe, expect, it } from "vitest";
import { guildAssetsModule } from "./index.js";

describe("guild-assets module", () => {
  it("se llama Guild Assets", () => {
    expect(guildAssetsModule.id).toBe("guild-assets");
    expect(guildAssetsModule.name).toBe("Guild Assets");
  });
});
