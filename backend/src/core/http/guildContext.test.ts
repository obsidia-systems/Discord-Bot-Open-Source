import { describe, expect, it } from "vitest";
import { extractGuildId } from "./guildContext.js";

describe("extractGuildId", () => {
  it("prioriza params", () => {
    const req = {
      params: { guildId: "111111111111111111" },
      query: { guildId: "222222222222222222" },
      body: { guildId: "333333333333333333" },
    };
    expect(extractGuildId(req as never)).toBe("111111111111111111");
  });

  it("cae a query y body", () => {
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

  it("devuelve undefined si falta", () => {
    expect(
      extractGuildId({ params: {}, query: {}, body: {} } as never),
    ).toBeUndefined();
  });
});
