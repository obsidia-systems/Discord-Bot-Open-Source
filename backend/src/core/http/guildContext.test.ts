import { describe, expect, it } from "vitest";
import { extractGuildId } from "./guildContext.js";

describe("extractGuildId", () => {
  it("prioritizes params", () => {
    const req = {
      params: { guildId: "111111111111111111" },
      query: { guildId: "222222222222222222" },
      body: { guildId: "333333333333333333" },
    };
    expect(extractGuildId(req as never)).toBe("111111111111111111");
  });

  it("falls back to query and body", () => {
    expect(
      extractGuildId({
        params: {},
        query: { guildId: "222222222222222222" },
        body: {},
      } as never),
    ).toBe("222222222222222222");
    expect(
      extractGuildId({
        params: {},
        query: {},
        body: { guildId: "333333333333333333" },
      } as never),
    ).toBe("333333333333333333");
  });

  it("returns undefined if missing", () => {
    expect(
      extractGuildId({ params: {}, query: {}, body: {} } as never),
    ).toBeUndefined();
  });
});
