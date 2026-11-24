// Turns the .env.example of the self-hosted Supabase stack into a .env with fresh secrets and the
// addresses of this installation. Used by deploy/server-setup.sh, see deploy/README.md.
//
//   node scripts/configureSupabaseEnv.ts --example <.env.example> --out <.env> \
//        --web-domain crm.example.ru --api-domain api.example.ru [--force]

import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type RandomHex = (bytes: number) => string;

const base64Url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

/** A JWT signed with HS256, like the anon and service_role keys of Supabase. */
export const signJwt = (
  payload: Record<string, unknown>,
  secret: string,
): string => {
  const unsigned = `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify(payload),
  )}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest();
  return `${unsigned}.${base64Url(signature)}`;
};

export interface Addresses {
  webDomain: string;
  apiDomain: string;
}

export const createValues = (
  { webDomain, apiDomain }: Addresses,
  randomHex: RandomHex = (bytes) => randomBytes(bytes).toString("hex"),
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Record<string, string> => {
  const jwtSecret = randomHex(32);
  const tenYears = 10 * 365 * 24 * 3600;
  const key = (role: string) =>
    signJwt(
      { role, iss: "supabase", iat: nowSeconds, exp: nowSeconds + tenYears },
      jwtSecret,
    );
  return {
    POSTGRES_PASSWORD: randomHex(24),
    JWT_SECRET: jwtSecret,
    ANON_KEY: key("anon"),
    SERVICE_ROLE_KEY: key("service_role"),
    DASHBOARD_USERNAME: "admin",
    DASHBOARD_PASSWORD: randomHex(16),
    SECRET_KEY_BASE: randomHex(48),
    VAULT_ENC_KEY: randomHex(16),
    PG_META_CRYPTO_KEY: randomHex(16),
    LOGFLARE_PUBLIC_ACCESS_TOKEN: randomHex(24),
    LOGFLARE_PRIVATE_ACCESS_TOKEN: randomHex(24),
    S3_PROTOCOL_ACCESS_KEY_ID: randomHex(16),
    S3_PROTOCOL_ACCESS_KEY_SECRET: randomHex(32),
    MINIO_ROOT_PASSWORD: randomHex(16),
    POOLER_TENANT_ID: "crm",
    SUPABASE_PUBLIC_URL: `https://${apiDomain}`,
    API_EXTERNAL_URL: `https://${apiDomain}/auth/v1`,
    SITE_URL: `https://${webDomain}`,
    ADDITIONAL_REDIRECT_URLS: `https://${webDomain}`,
    // The CRM edge functions check the token themselves
    FUNCTIONS_VERIFY_JWT: "false",
  };
};

/** Sets the given keys in the text of an .env file; keys that are absent are added and reported. */
export const setEnvValues = (
  example: string,
  values: Record<string, string>,
): { content: string; missing: string[] } => {
  let content = example;
  const missing: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const line = new RegExp(`^${name}=.*$`, "m");
    if (line.test(content)) {
      // a function as replacement: "$" in a value is not a pattern
      content = content.replace(line, () => `${name}=${value}`);
    } else {
      missing.push(name);
      content = `${content.replace(/\n*$/, "\n")}${name}=${value}\n`;
    }
  }
  return { content, missing };
};

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

if (import.meta.main) {
  const example = readArg("example");
  const out = readArg("out");
  const webDomain = readArg("web-domain");
  const apiDomain = readArg("api-domain");
  if (!example || !out || !webDomain || !apiDomain) {
    console.error(
      "Usage: node scripts/configureSupabaseEnv.ts --example <file> --out <file> --web-domain <d> --api-domain <d> [--force]",
    );
    process.exit(2);
  }
  if (existsSync(out) && !process.argv.includes("--force")) {
    console.error(
      `${out} exists: secrets are not replaced. Use --force to generate new ones (this breaks a running installation).`,
    );
    process.exit(1);
  }
  const { content, missing } = setEnvValues(
    readFileSync(example, "utf8"),
    createValues({ webDomain, apiDomain }),
  );
  writeFileSync(out, content, { mode: 0o600 });
  if (missing.length > 0) {
    console.warn(
      `Added keys that the example does not have (check the Supabase version): ${missing.join(", ")}`,
    );
  }
  process.stdout.write(`Wrote ${out}\n`);
}
