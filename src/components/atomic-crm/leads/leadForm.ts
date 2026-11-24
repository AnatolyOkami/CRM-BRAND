import { config } from "../root/config";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export interface LeadFormValues {
  name: string;
  contact: string;
  description: string;
}

/**
 * Validation of the short form. The server validates the same rules again: this only gives the
 * answer next to the field instead of after the round trip.
 */
export const validateLeadForm = (
  values: LeadFormValues,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!values.contact.trim()) errors.contact = "crm.lead_form.contact_required";
  else if (values.contact.trim().length > 200) {
    errors.contact = "crm.lead_form.too_long";
  }
  if (values.name.trim().length > 120) errors.name = "crm.lead_form.too_long";
  if (values.description.trim().length > 4000) {
    errors.description = "crm.lead_form.too_long";
  }
  return errors;
};

/** The UTM labels of the link of the form; the form runs in a hash router, so both places are read. */
export const readUtm = (
  ...sources: Array<URLSearchParams | undefined>
): Record<string, string> | undefined => {
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    for (const params of sources) {
      const value = params?.get(key)?.trim();
      if (value && !(key in utm)) utm[key] = value.slice(0, 200);
    }
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
};

export type SubmitLeadResult =
  { ok: true; duplicate: boolean } | { ok: false; error: string };

export interface SubmitLeadPayload extends LeadFormValues {
  code: string;
  /** One id per opening of the form: pressing the button twice sends the same lead */
  submissionId: string;
  utm?: Record<string, string>;
  /** A hidden field: people leave it empty, robots fill it */
  website?: string;
}

/**
 * Sends the lead to the intake function of the server. In the demo there is no server: the form
 * only pretends, nothing is stored.
 */
export const submitLead = async (
  payload: SubmitLeadPayload,
  fetcher: typeof fetch = fetch,
): Promise<SubmitLeadResult> => {
  if (!config.supabaseUrl) return { ok: true, duplicate: false };
  try {
    const response = await fetcher(
      `${config.supabaseUrl}/functions/v1/lead_intake`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.supabasePublishableKey
            ? { apikey: config.supabasePublishableKey }
            : {}),
        },
        body: JSON.stringify({
          code: payload.code,
          submission_id: payload.submissionId,
          name: payload.name.trim(),
          contact: payload.contact.trim(),
          description: payload.description.trim(),
          utm: payload.utm,
          website: payload.website,
        }),
      },
    );
    if (response.ok) {
      const body = (await response.json()) as { duplicate?: boolean };
      return { ok: true, duplicate: Boolean(body.duplicate) };
    }
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return { ok: false, error: body.message ?? `http_${response.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
};
