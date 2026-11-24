import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createValues, setEnvValues, signJwt } from "./configureSupabaseEnv";

const counter = () => {
  let n = 0;
  return (bytes: number) =>
    `${(n++).toString(16).padStart(2, "0")}`.repeat(bytes);
};

describe("signJwt", () => {
  it("produces a token that the secret verifies", () => {
    const token = signJwt({ role: "anon" }, "secret");
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      role: "anon",
    });
    expect(signature).toBe(
      createHmac("sha256", "secret")
        .update(`${header}.${payload}`)
        .digest("base64url"),
    );
  });
});

describe("createValues", () => {
  const values = createValues(
    { webDomain: "crm.example.ru", apiDomain: "api.example.ru" },
    counter(),
    1_800_000_000,
  );

  it("signs the anon and service_role keys with the generated JWT secret", () => {
    for (const [name, role] of [
      ["ANON_KEY", "anon"],
      ["SERVICE_ROLE_KEY", "service_role"],
    ] as const) {
      const [header, payload, signature] = values[name].split(".");
      expect(
        JSON.parse(Buffer.from(payload, "base64url").toString()),
      ).toMatchObject({
        role,
        iat: 1_800_000_000,
      });
      expect(signature).toBe(
        createHmac("sha256", values.JWT_SECRET)
          .update(`${header}.${payload}`)
          .digest("base64url"),
      );
    }
  });

  it("points every address at the domains of the installation", () => {
    expect(values.SITE_URL).toBe("https://crm.example.ru");
    expect(values.SUPABASE_PUBLIC_URL).toBe("https://api.example.ru");
    expect(values.API_EXTERNAL_URL).toBe("https://api.example.ru/auth/v1");
  });

  it("gives each secret its own value", () => {
    const secrets = [
      values.POSTGRES_PASSWORD,
      values.JWT_SECRET,
      values.DASHBOARD_PASSWORD,
      values.SECRET_KEY_BASE,
      values.VAULT_ENC_KEY,
    ];
    expect(new Set(secrets).size).toBe(secrets.length);
  });
});

describe("setEnvValues", () => {
  it("replaces existing keys, keeps the rest and reports the keys that were added", () => {
    const result = setEnvValues("A=1\n# comment\nB=old\n", {
      B: "new$&",
      C: "3",
    });
    expect(result.content).toBe("A=1\n# comment\nB=new$&\nC=3\n");
    expect(result.missing).toEqual(["C"]);
  });

  it("does not touch a key that only starts with the same letters", () => {
    const result = setEnvValues("JWT_SECRET_OLD=x\nJWT_SECRET=y\n", {
      JWT_SECRET: "z",
    });
    expect(result.content).toBe("JWT_SECRET_OLD=x\nJWT_SECRET=z\n");
  });
});
