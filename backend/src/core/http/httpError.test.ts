import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError, mapHttpError } from "./httpError.js";
import { isSnowflake } from "./snowflake.js";
import { parse, ValidationError } from "./validate.js";

describe("parse", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns the value if valid", () => {
    expect(parse(schema, { name: "ok" })).toEqual({ name: "ok" });
  });

  it("throws ValidationError with issues", () => {
    try {
      parse(schema, {});
      throw new Error("should have failed");
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
  it("maps a domain HttpError", () => {
    const mapped = mapHttpError(new HttpError("Not found.", 404, "NOT_FOUND"));
    expect(mapped).toEqual({
      status: 404,
      body: { error: "Not found.", code: "NOT_FOUND" },
      log: false,
    });
  });

  it("hides internal errors", () => {
    const mapped = mapHttpError(new Error("secret stack"));
    expect(mapped.status).toBe(500);
    expect(mapped.body).toEqual({
      error: "Internal error.",
      code: "INTERNAL_ERROR",
    });
    expect(mapped.log).toBe(true);
  });

  it("explains an invalid Stripe price id", () => {
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

  it("explains a price id from another Stripe account", () => {
    const error = Object.assign(new Error("No such price: 'price_abc'"), {
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toMatch(/same account/);
  });

  it("explains a customer from another Stripe account", () => {
    const error = Object.assign(new Error("No such customer: 'cus_abc'"), {
      name: "StripeInvalidRequestError",
      type: "StripeInvalidRequestError",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toMatch(/customer/i);
  });

  it("detects the multer limit", () => {
    const error = Object.assign(new Error("too large"), {
      code: "LIMIT_FILE_SIZE",
    });
    const mapped = mapHttpError(error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("FILE_TOO_LARGE");
  });
});

describe("isSnowflake", () => {
  it("accepts Discord snowflakes", () => {
    expect(isSnowflake("123456789012345678")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isSnowflake("abc")).toBe(false);
    expect(isSnowflake(123)).toBe(false);
    expect(isSnowflake("")).toBe(false);
  });
});
