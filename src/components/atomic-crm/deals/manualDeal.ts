import type { Identifier } from "ra-core";

import type { DealSource, ManualDealData } from "../types";

export type ContactMode = "existing" | "new";

export interface ManualDealFormValues {
  name?: string;
  contact_id?: Identifier;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  company_id?: Identifier | null;
  description?: string;
  source: DealSource;
  received_at: string;
  categories?: string[];
  amount?: number | null;
  assign_to_me: boolean;
}

/** datetime-local value of a moment, in the browser time zone */
export const toLocalInputValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

/**
 * Validation of the form. The server validates the same rules again: this only gives the answer
 * next to the field instead of after the round trip.
 */
export const validateManualDeal = (
  values: Partial<ManualDealFormValues>,
  mode: ContactMode,
  now: Date = new Date(),
): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!values.name?.trim()) errors.name = "ra.validation.required";
  if (mode === "existing") {
    if (values.contact_id == null) errors.contact_id = "ra.validation.required";
  } else if (
    ![values.first_name, values.last_name, values.phone, values.email].some(
      (value) => value?.trim(),
    )
  ) {
    errors.first_name = "crm.manual_deal.contact_required";
  }
  if (values.received_at && new Date(values.received_at) > now) {
    errors.received_at = "crm.manual_deal.received_future";
  }
  return errors;
};

export const toManualDealData = (
  values: ManualDealFormValues,
  mode: ContactMode,
): ManualDealData => ({
  name: values.name!.trim(),
  ...(mode === "existing"
    ? { contact_id: values.contact_id }
    : {
        new_contact: {
          first_name: values.first_name?.trim() || undefined,
          last_name: values.last_name?.trim() || undefined,
          phone: values.phone?.trim() || undefined,
          email: values.email?.trim() || undefined,
        },
      }),
  company_id: values.company_id ?? null,
  description: values.description,
  source: values.source,
  received_at: values.received_at
    ? new Date(values.received_at).toISOString()
    : undefined,
  categories: values.categories,
  amount: values.amount ?? null,
  assign_to_me: values.assign_to_me,
});
