// Pure parts of the lead intake: the request body and the signature of a website request.
// No runtime imports, so that the same code runs in Deno and in the unit tests.

export type IntakeRequest = {
  code: string;
  submissionId: string;
  name: string | null;
  contact: string;
  description: string | null;
  utm: Record<string, string> | null;
  // A hidden field of the form that people leave empty and robots fill
  isRobot: boolean;
};

export type ParsedIntake =
  { ok: true; value: IntakeRequest } | { ok: false; error: string };

const MAX_NAME = 120;
const MAX_CONTACT = 200;
const MAX_DESCRIPTION = 4000;
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export function parseIntakeBody(raw: unknown): ParsedIntake {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "invalid_body" };
  }
  const body = raw as Record<string, unknown>;

  const code = text(body.code);
  if (code === null || !/^[0-9a-f]{24}$/.test(code)) {
    return { ok: false, error: "invalid_code" };
  }
  const submissionId = text(body.submission_id);
  if (
    submissionId === null ||
    submissionId.length < 8 ||
    submissionId.length > 100
  ) {
    return { ok: false, error: "invalid_submission_id" };
  }
  const contact = text(body.contact);
  if (contact === null) return { ok: false, error: "contact_required" };
  const name = text(body.name);
  const description = text(body.description);
  if (
    contact.length > MAX_CONTACT ||
    (name?.length ?? 0) > MAX_NAME ||
    (description?.length ?? 0) > MAX_DESCRIPTION
  ) {
    return { ok: false, error: "text_too_long" };
  }

  let utm: Record<string, string> | null = null;
  if (typeof body.utm === "object" && body.utm !== null) {
    const source = body.utm as Record<string, unknown>;
    for (const key of UTM_KEYS) {
      const value = text(source[key]);
      if (value !== null && value.length <= 200) {
        utm = { ...(utm ?? {}), [key]: value };
      }
    }
  }

  return {
    ok: true,
    value: {
      code,
      submissionId,
      name,
      contact,
      description,
      utm,
      isRobot: text(body.website) !== null,
    },
  };
}

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/** The value of the X-Signature header of a website request: "sha256=" + HMAC-SHA256(secret, raw body). */
export async function signBody(
  secret: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return `sha256=${toHex(signature)}`;
}

export async function isValidSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header || !secret) return false;
  const expected = await signBody(secret, rawBody);
  const given = header.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  // compare without stopping at the first difference
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return difference === 0;
}

/** SQL errors of intake_lead that are the fault of the request, with the HTTP status to answer. */
export function statusOfIntakeError(message: string): number | null {
  if (message.includes("partner_not_found")) return 404;
  if (
    message.includes("contact_required") ||
    message.includes("invalid_submission_id") ||
    message.includes("text_too_long")
  ) {
    return 422;
  }
  return null;
}
