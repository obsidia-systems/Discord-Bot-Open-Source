import { describe, expect, it } from "vitest";
import { takeOauthVerifier } from "./sessionStore.js";

describe("takeOauthVerifier (consume-once)", () => {
  it("returns the verifier if it has not expired", () => {
    expect(
      takeOauthVerifier(
        { codeVerifier: "abc", expiresAt: new Date(Date.now() + 60_000) },
        Date.now(),
      ),
    ).toBe("abc");
  });

  it("rejects an already expired state", () => {
    expect(
      takeOauthVerifier(
        { codeVerifier: "abc", expiresAt: new Date(Date.now() - 1) },
        Date.now(),
      ),
    ).toBeNull();
  });
});
