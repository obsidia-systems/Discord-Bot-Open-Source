import { describe, expect, it } from "vitest";
import {
  isAdobosRole,
  roleRunsGateway,
  roleRunsHttp,
  roleRunsWorker,
} from "./index.js";

describe("ADOBO_ROLE", () => {
  it("accepts the four roles", () => {
    expect(isAdobosRole("all")).toBe(true);
    expect(isAdobosRole("api")).toBe(true);
    expect(isAdobosRole("bot")).toBe(false);
  });

  it("api does not run gateway or worker", () => {
    expect(roleRunsHttp("api")).toBe(true);
    expect(roleRunsGateway("api")).toBe(false);
    expect(roleRunsWorker("api")).toBe(false);
  });

  it("all runs all three layers", () => {
    expect(roleRunsHttp("all")).toBe(true);
    expect(roleRunsGateway("all")).toBe(true);
    expect(roleRunsWorker("all")).toBe(true);
  });
});
