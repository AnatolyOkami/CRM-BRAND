// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isValidSignature,
  parseIntakeBody,
  signBody,
  statusOfIntakeError,
} from "./intake";

const CODE = "a1b2c3d4e5f60718293a4b5c";
const valid = {
  code: CODE,
  submission_id: "submission-0001",
  name: "  Алексей ",
  contact: " +7 900 123-45-67 ",
  description: "Баннер 3×6",
};

describe("parseIntakeBody", () => {
  it("trims the text and keeps the fields of a good request", () => {
    const parsed = parseIntakeBody(valid);

    expect(parsed).toEqual({
      ok: true,
      value: {
        code: CODE,
        submissionId: "submission-0001",
        name: "Алексей",
        contact: "+7 900 123-45-67",
        description: "Баннер 3×6",
        utm: null,
        isRobot: false,
      },
    });
  });

  it("needs a contact but not a name or a description", () => {
    const withoutOptional = parseIntakeBody({
      code: CODE,
      submission_id: "submission-0002",
      contact: "a@b.ru",
    });
    const withoutContact = parseIntakeBody({ ...valid, contact: "   " });

    expect(withoutOptional.ok).toBe(true);
    expect(withoutContact).toEqual({ ok: false, error: "contact_required" });
  });

  it("rejects a body that is not an object, a bad code and a short id", () => {
    expect(parseIntakeBody("text")).toEqual({
      ok: false,
      error: "invalid_body",
    });
    expect(parseIntakeBody(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(parseIntakeBody({ ...valid, code: "short" })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect(parseIntakeBody({ ...valid, submission_id: "abc" })).toEqual({
      ok: false,
      error: "invalid_submission_id",
    });
  });

  it("rejects too long text", () => {
    const parsed = parseIntakeBody({ ...valid, description: "x".repeat(4001) });

    expect(parsed).toEqual({ ok: false, error: "text_too_long" });
  });

  it("keeps only the usual UTM labels as short strings", () => {
    const parsed = parseIntakeBody({
      ...valid,
      utm: { utm_source: "yandex", utm_term: 5, evil: "x", utm_medium: "" },
    });

    expect(parsed.ok && parsed.value.utm).toEqual({ utm_source: "yandex" });
  });

  it("marks a request with a filled hidden field as a robot", () => {
    const parsed = parseIntakeBody({
      ...valid,
      website: "http://spam.example",
    });

    expect(parsed.ok && parsed.value.isRobot).toBe(true);
  });
});

describe("signature of a website request", () => {
  it("accepts the signature made with the shared secret", async () => {
    const body = JSON.stringify(valid);
    const header = await signBody("secret-1", body);

    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(await isValidSignature("secret-1", body, header)).toBe(true);
  });

  it("matches the known HMAC-SHA256 value", async () => {
    // HMAC_SHA256("key", "The quick brown fox jumps over the lazy dog")
    const header = await signBody(
      "key",
      "The quick brown fox jumps over the lazy dog",
    );

    expect(header).toBe(
      "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("rejects another secret, another body, a missing or a malformed header", async () => {
    const body = JSON.stringify(valid);
    const header = await signBody("secret-1", body);

    expect(await isValidSignature("secret-2", body, header)).toBe(false);
    expect(await isValidSignature("secret-1", body + " ", header)).toBe(false);
    expect(await isValidSignature("secret-1", body, null)).toBe(false);
    expect(await isValidSignature("secret-1", body, "sha256=abc")).toBe(false);
    expect(await isValidSignature("", body, header)).toBe(false);
  });
});

describe("statusOfIntakeError", () => {
  it("separates the fault of the request from the fault of the server", () => {
    expect(statusOfIntakeError("partner_not_found")).toBe(404);
    expect(statusOfIntakeError("contact_required")).toBe(422);
    expect(statusOfIntakeError("connection refused")).toBeNull();
  });
});
