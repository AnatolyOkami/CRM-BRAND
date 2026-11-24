import { toLocalInputValue } from "./manualDeal";

export interface CallResultFormValues {
  result: string;
  recallEnabled: boolean;
  /** datetime-local value in the browser time zone */
  recallAt: string;
}

/** Tomorrow at 10:00 local time, the usual moment to call a customer back. */
export const defaultRecallAt = (now: Date = new Date()): string => {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(10, 0, 0, 0);
  return toLocalInputValue(next);
};

/**
 * Validation of the form. The server validates the same rules again: this only gives the answer
 * next to the field instead of after the round trip.
 */
export const validateCallResult = (
  values: CallResultFormValues,
  now: Date = new Date(),
): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!values.result.trim()) errors.result = "crm.call_dialog.result_required";
  if (values.recallEnabled) {
    const at = new Date(values.recallAt);
    if (!values.recallAt || Number.isNaN(at.getTime())) {
      errors.recallAt = "crm.call_dialog.recall_required";
    } else if (at.getTime() < now.getTime() - 5 * 60_000) {
      errors.recallAt = "crm.call_dialog.recall_in_past";
    }
  }
  return errors;
};

/** The moment sent to the server: an ISO string, or null when no call back is planned. */
export const toRecallIso = (values: CallResultFormValues): string | null =>
  values.recallEnabled && values.recallAt
    ? new Date(values.recallAt).toISOString()
    : null;
