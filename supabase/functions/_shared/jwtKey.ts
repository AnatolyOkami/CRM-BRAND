export type VerificationKey =
  { kind: "secret"; secret: Uint8Array } | { kind: "jwks" };

/**
 * Which key verifies a token. Projects with asymmetric signing keys (Supabase cloud, the local CLI)
 * publish them as JWKS. A self-hosted stack signs with the shared JWT secret (HS256) and has no JWKS
 * to read: the secret is used only for tokens that really say HS256, anything else goes to JWKS.
 */
export const chooseVerificationKey = (
  algorithm: string | undefined,
  jwtSecret: string | undefined,
): VerificationKey =>
  algorithm === "HS256" && jwtSecret
    ? { kind: "secret", secret: new TextEncoder().encode(jwtSecret) }
    : { kind: "jwks" };
