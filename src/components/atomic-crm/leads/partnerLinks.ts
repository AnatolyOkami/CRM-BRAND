/** The public address of the short form of a partner; the app uses a hash router. */
export const partnerFormUrl = (
  code: string,
  location: Pick<Location, "origin" | "pathname"> = window.location,
): string => `${location.origin}${location.pathname}#/lead/${code}`;

/** The address that a website sends its signed requests to. */
export const intakeEndpointUrl = (supabaseUrl: string | undefined): string =>
  `${(supabaseUrl ?? "").replace(/\/+$/, "")}/functions/v1/lead_intake`;
