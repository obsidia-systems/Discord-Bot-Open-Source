import "zod/compile";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parse } from "../http/validate.js";

describe("zod compile (global)", () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().int(),
    tags: z.array(z.string()),
  });

  it("parsea un objeto válido", () => {
    expect(parse(schema, { name: "ok", count: 2, tags: ["a"] })).toEqual({
      name: "ok",
      count: 2,
      tags: ["a"],
    });
  });
});
