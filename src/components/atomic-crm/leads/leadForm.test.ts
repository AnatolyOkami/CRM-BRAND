import { describe, expect, it, vi } from "vitest";

import { partnerFormUrl, intakeEndpointUrl } from "./partnerLinks";
import { readUtm, submitLead, validateLeadForm } from "./leadForm";

vi.mock("../root/config", () => ({
  config: {
    supabaseUrl: "https://api.example.ru",
    supabasePublishableKey: "pk",
  },
}));

const payload = {
  code: "a1b2c3d4e5f60718293a4b5c",
  submissionId: "11111111-2222-3333-4444-555555555555",
  name: " Алексей ",
  contact: " +7 900 123-45-67 ",
  description: " Баннер ",
};

describe("validateLeadForm", () => {
  it("needs a contact and nothing else", () => {
    expect(
      validateLeadForm({ name: "", contact: "  ", description: "" }),
    ).toEqual({ contact: "crm.lead_form.contact_required" });
    expect(
      validateLeadForm({ name: "", contact: "a@b.ru", description: "" }),
    ).toEqual({});
  });

  it("refuses text that the server would refuse", () => {
    const errors = validateLeadForm({
      name: "x".repeat(121),
      contact: "y".repeat(201),
      description: "z".repeat(4001),
    });

    expect(Object.keys(errors).sort()).toEqual([
      "contact",
      "description",
      "name",
    ]);
  });
});

describe("readUtm", () => {
  it("collects the labels from the address and from the hash, the first source wins", () => {
    const utm = readUtm(
      new URLSearchParams("utm_source=yandex&x=1"),
      new URLSearchParams("utm_source=other&utm_campaign=spring"),
    );

    expect(utm).toEqual({ utm_source: "yandex", utm_campaign: "spring" });
  });

  it("returns nothing when there are no labels", () => {
    expect(readUtm(new URLSearchParams("x=1"), undefined)).toBeUndefined();
  });
});

describe("partner links", () => {
  it("builds the address of the form for the hash router", () => {
    expect(
      partnerFormUrl("abc", {
        origin: "https://crm.example.ru",
        pathname: "/",
      }),
    ).toBe("https://crm.example.ru/#/lead/abc");
  });

  it("builds the address of the intake function without a double slash", () => {
    expect(intakeEndpointUrl("https://api.example.ru/")).toBe(
      "https://api.example.ru/functions/v1/lead_intake",
    );
  });
});

describe("submitLead", () => {
  it("sends the trimmed lead with the submission id and the key of the project", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, duplicate: false })),
    );

    const result = await submitLead(
      payload,
      fetcher as unknown as typeof fetch,
    );

    expect(result).toEqual({ ok: true, duplicate: false });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.example.ru/functions/v1/lead_intake");
    expect((init.headers as Record<string, string>).apikey).toBe("pk");
    expect(JSON.parse(init.body as string)).toMatchObject({
      code: payload.code,
      submission_id: payload.submissionId,
      name: "Алексей",
      contact: "+7 900 123-45-67",
      description: "Баннер",
    });
  });

  it("reports the code of an error answer and a network failure", async () => {
    const refused = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "partner_not_found" }), {
          status: 404,
        }),
    );
    const broken = vi.fn(async () => {
      throw new Error("offline");
    });

    expect(
      await submitLead(payload, refused as unknown as typeof fetch),
    ).toEqual({ ok: false, error: "partner_not_found" });
    expect(
      await submitLead(payload, broken as unknown as typeof fetch),
    ).toEqual({ ok: false, error: "network" });
  });
});
