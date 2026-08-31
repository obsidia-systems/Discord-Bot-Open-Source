import { describe, expect, it } from "vitest";
import {
  isAdobosRole,
  roleRunsGateway,
  roleRunsHttp,
  roleRunsWorker,
} from "./index.js";

describe("ADOBO_ROLE", () => {
  it("acepta los cuatro roles", () => {
    expect(isAdobosRole("all")).toBe(true);
    expect(isAdobosRole("api")).toBe(true);
    expect(isAdobosRole("bot")).toBe(false);
  });

  it("api no corre gateway ni worker", () => {
    expect(roleRunsHttp("api")).toBe(true);
    expect(roleRunsGateway("api")).toBe(false);
    expect(roleRunsWorker("api")).toBe(false);
  });

  it("all corre las tres capas", () => {
    expect(roleRunsHttp("all")).toBe(true);
    expect(roleRunsGateway("all")).toBe(true);
    expect(roleRunsWorker("all")).toBe(true);
  });
});
