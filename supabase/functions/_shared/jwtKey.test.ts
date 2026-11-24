import { describe, expect, it } from "vitest";

import { chooseVerificationKey } from "./jwtKey";

describe("chooseVerificationKey", () => {
  it("verifies an HS256 token with the shared secret of a self-hosted stack", () => {
    const key = chooseVerificationKey("HS256", "s3cret");
    expect(key.kind).toBe("secret");
    if (key.kind === "secret") {
      expect(new TextDecoder().decode(key.secret)).toBe("s3cret");
    }
  });

  it("reads the JWKS for asymmetric tokens, even when a secret is configured", () => {
    expect(chooseVerificationKey("ES256", "s3cret")).toEqual({ kind: "jwks" });
    expect(chooseVerificationKey("RS256", "s3cret")).toEqual({ kind: "jwks" });
  });

  it("falls back to the JWKS when no secret is configured", () => {
    expect(chooseVerificationKey("HS256", undefined)).toEqual({ kind: "jwks" });
    expect(chooseVerificationKey("HS256", "")).toEqual({ kind: "jwks" });
  });

  it("never accepts an unsigned or unknown algorithm through the secret", () => {
    expect(chooseVerificationKey("none", "s3cret")).toEqual({ kind: "jwks" });
    expect(chooseVerificationKey(undefined, "s3cret")).toEqual({
      kind: "jwks",
    });
  });
});
