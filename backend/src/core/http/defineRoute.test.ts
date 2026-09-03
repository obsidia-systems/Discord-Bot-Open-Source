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

  it("llama next(ValidationError) y NO al handler con body inválido", async () => {
    const handler = vi.fn();
    const next = vi.fn();
    const mw = defineRoute({ body: z.object({ n: z.number() }) }, handler);

    await mw(
      fakeReq({ body: { n: "no-num" } }),
      fakeRes(),
      next as NextFunction,
    );

    expect(handler).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ValidationError);
  });

  it("reenvía el rechazo async del handler a next", async () => {
    const boom = new Error("boom");
    const next = vi.fn();
    const mw = defineRoute({}, async () => {
      throw boom;
    });

    await mw(fakeReq(), fakeRes(), next as NextFunction);
    // microtask del .catch(next)
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(boom);
  });
});
