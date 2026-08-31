import { describe, expect, it } from "vitest";
import { takeOauthVerifier } from "./sessionStore.js";

describe("takeOauthVerifier (consume-once)", () => {
  it("devuelve el verifier si no caducó", () => {
    expect(
      takeOauthVerifier(
        { codeVerifier: "abc", expiresAt: new Date(Date.now() + 60_000) },
        Date.now(),
      ),
    ).toBe("abc");
  });

  it("rechaza un state ya caducado", () => {
    expect(
      takeOauthVerifier(
        { codeVerifier: "abc", expiresAt: new Date(Date.now() - 1) },
        Date.now(),
      ),
    ).toBeNull();
  });
});
