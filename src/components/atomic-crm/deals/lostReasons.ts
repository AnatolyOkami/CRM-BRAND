/** The typical reasons of a refusal, chosen with a button; the label comes from crm.lost_dialog.reasons.<code>. */
export const LOST_REASONS = [
  "too-expensive",
  "chose-another",
  "changed-mind",
  "no-answer",
  "no-budget",
  "not-our-profile",
  "duplicate",
  "other",
] as const;

export type LostReasonCode = (typeof LOST_REASONS)[number];

/** "other" has no meaning without a comment; every other reason may stand alone. */
export const isLostReasonComplete = (
  code: LostReasonCode | null,
  comment: string,
): boolean => {
  if (code === null) return false;
  return code !== "other" || comment.trim().length > 0;
};

/** The text stored with the deal: the label of the reason, then the comment of the manager. */
export const composeLostReason = (label: string, comment: string): string => {
  const trimmed = comment.trim();
  return trimmed ? `${label}: ${trimmed}` : label;
};
