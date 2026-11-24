import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  isValidSignature,
  parseIntakeBody,
  statusOfIntakeError,
} from "./intake.ts";

const json = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// Accepts a lead from the short form of an advertising partner (a public link with a code)
// or from the website of the owner (a request signed with a shared secret, header X-Signature).
// The idempotency key is submission_id: a repeated submission answers with the same deal.
async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return createErrorResponse(405, "Method Not Allowed");
  }

  const rawBody = await req.text();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return createErrorResponse(400, "invalid_body");
  }
  const parsed = parseIntakeBody(parsedJson);
  if (!parsed.ok) {
    return createErrorResponse(422, parsed.error);
  }
  const lead = parsed.value;

  const { data: partner, error: partnerError } = await supabaseAdmin.rpc(
    "get_intake_partner",
    { p_code: lead.code },
  );
  if (partnerError) {
    console.error("lead_intake: partner lookup failed", partnerError);
    return createErrorResponse(500, "Internal Server Error");
  }
  if (!partner || !partner.is_active) {
    return createErrorResponse(404, "partner_not_found");
  }
  if (partner.kind === "website") {
    const signed = await isValidSignature(
      partner.secret ?? "",
      rawBody,
      req.headers.get("x-signature"),
    );
    if (!signed) {
      return createErrorResponse(401, "invalid_signature");
    }
  }

  // Robots get the same answer as people, and nothing is created
  if (lead.isRobot) {
    return json({ ok: true, duplicate: false });
  }

  const { data, error } = await supabaseAdmin.rpc("intake_lead", {
    p_partner_code: lead.code,
    p_submission_id: lead.submissionId,
    p_name: lead.name,
    p_contact: lead.contact,
    p_description: lead.description,
    p_utm: lead.utm,
  });
  if (error) {
    const status = statusOfIntakeError(error.message ?? "");
    if (status !== null) {
      return createErrorResponse(status, error.message);
    }
    console.error("lead_intake: intake failed", error);
    return createErrorResponse(500, "Internal Server Error");
  }

  return json({ ok: true, duplicate: Boolean(data?.duplicate) });
}

Deno.serve((req: Request) => OptionsMiddleware(req, handle));
