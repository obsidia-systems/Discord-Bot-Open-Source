import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineRoute, ValidationError } from "./validate.js";

function fakeReq(over: Partial<Request> = {}): Request {
  return { body: {}, query: {}, params: {}, ...over } as Request;
}
const fakeRes = () => ({}) as Response;

describe("defineRoute", () => {
  it("parsea body/query/params y los pasa tipados al handler", async () => {
    const handler = vi.fn((_req, _res, valid) => {
      expect(valid.body).toEqual({ name: "x" });
      expect(valid.query).toEqual({ limit: 5 });
      expect(valid.params).toEqual({ id: 12 });
    });
    const mw = defineRoute(
      {
        body: z.object({ name: z.string() }),
        query: z.object({ limit: z.coerce.number() }),
        params: z.object({ id: z.coerce.number() }),
      },
      handler,
    );

    await mw(
      fakeReq({
        body: { name: "x" },
        query: { limit: "5" } as unknown as Request["query"],
        params: { id: "12" } as unknown as Request["params"],
      }),
      fakeRes(),
      vi.fn() as unknown as NextFunction,
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rechaza con ValidationError y NO llama al handler con body inválido", async () => {
    const handler = vi.fn();
    const mw = defineRoute({ body: z.object({ n: z.number() }) }, handler);

    // Express 5 await-ea el middleware y enruta el rechazo al errorHandler.
    await expect(
      mw(
        fakeReq({ body: { n: "no-num" } }),
        fakeRes(),
        vi.fn() as unknown as NextFunction,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(handler).not.toHaveBeenCalled();
  });

  it("propaga el rechazo async del handler (Express 5 lo enruta a errorHandler)", async () => {
    const boom = new Error("boom");
    const mw = defineRoute({}, async () => {
      throw boom;
    });

    await expect(
      mw(fakeReq(), fakeRes(), vi.fn() as unknown as NextFunction),
    ).rejects.toBe(boom);
  });
});
