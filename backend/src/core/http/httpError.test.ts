import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError, mapHttpError } from "./httpError.js";
import { isSnowflake } from "./snowflake.js";
import { parse, ValidationError } from "./validate.js";

describe("parse", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("devuelve el valor si es válido", () => {
    expect(parse(schema, { name: "ok" })).toEqual({ name: "ok" });
  });

  it("lanza ValidationError con issues", () => {
    try {
      parse(schema, {});
      throw new Error("debía fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const mapped = mapHttpError(error);
      expect(mapped.status).toBe(400);
      expect(mapped.body.code).toBe("INVALID_BODY");
      expect(mapped.body.issues?.length).toBeGreaterThan(0);
    }
  });
});

describe("mapHttpError", () => {
  it("mapea HttpError de dominio", () => {
    const mapped = mapHttpError(
      new HttpError("No encontrado.", 404, "NOT_FOUND"),
    );
    expect(mapped).toEqual({
      status: 404,
      body: { error: "No encontrado.", code: "NOT_FOUND" },
      log: false,
    });
  });

  it("oculta errores internos", () => {
    const mapped = mapHttpError(new Error("stack secreto"));
    expect(mapped.status).toBe(500);
    expect(mapped.body).toEqual({
      error: "Error interno.",
      code: "INTERNAL_ERROR",
    });
    expect(mapped.log).toBe(true);
  });

  it("explica un price id inválido de Stripe", () => {
    const error = Object.assign(new Error("No such price: 'prod_abc'"), {
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("STRIPE_INVALID_REQUEST");
    expect(mapped.body.error).toMatch(/prod_/);
    expect(mapped.log).toBe(false);
  });

  it("explica un price id de otra cuenta Stripe", () => {
    const error = Object.assign(new Error("No such price: 'price_abc'"), {
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toMatch(/misma cuenta/);
  });

  it("explica un customer de otra cuenta Stripe", () => {
    const error = Object.assign(new Error("No such customer: 'cus_abc'"), {
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toMatch(/customer/i);
  });

  it("detecta límite de multer", () => {
    const error = Object.assign(new Error("too large"), {
      code: "LIMIT_FILE_SIZE",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("FILE_TOO_LARGE");
  });
});

describe("isSnowflake", () => {
  it("acepta snowflakes de Discord", () => {
    expect(isSnowflake("123456789012345678")).toBe(true);
  });

  it("rechaza basura", () => {
    expect(isSnowflake("abc")).toBe(false);
    expect(isSnowflake(123)).toBe(false);
    expect(isSnowflake("")).toBe(false);
  });
});
