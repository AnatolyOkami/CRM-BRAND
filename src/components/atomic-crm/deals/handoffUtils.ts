import type { OrderLink } from "../types";

/** Same rule as the database: http or https, no spaces. */
export const isHttpUrl = (value: string): boolean =>
  /^https?:\/\/[^\s]+$/.test(value.trim());

export type HandoffFormErrors = { productName?: string };

export const validateHandoffForm = (values: {
  productName: string;
}): HandoffFormErrors =>
  values.productName.trim() ? {} : { productName: "ra.validation.required" };

/** Adds a link to the list, or says why it cannot be added. The list is never mutated. */
export const addOrderLink = (
  links: OrderLink[],
  url: string,
  label: string,
): { links: OrderLink[]; error?: "invalid" | "duplicate" } => {
  const trimmed = url.trim();
  if (!isHttpUrl(trimmed)) return { links, error: "invalid" };
  if (links.some((link) => link.url === trimmed)) {
    return { links, error: "duplicate" };
  }
  return { links: [...links, { url: trimmed, label: label.trim() }] };
};
