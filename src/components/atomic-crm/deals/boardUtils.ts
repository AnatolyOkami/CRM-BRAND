import type { Deal } from "../types";

/** Stages where the customer still waits for the first reply. */
const FIRST_REPLY_STAGES = ["opportunity", "to-contact"];

export type ReplyStatus =
  | { kind: "none" }
  | { kind: "replied" }
  | { kind: "pending"; dueAt: Date }
  | { kind: "overdue"; dueAt: Date; lateMs: number };

export const getReplyStatus = (
  deal: Pick<
    Deal,
    "stage" | "first_response_due_at" | "first_responded_at" | "is_historical"
  >,
  now: Date = new Date(),
): ReplyStatus => {
  if (deal.first_responded_at) return { kind: "replied" };
  if (
    !deal.first_response_due_at ||
    deal.is_historical ||
    !FIRST_REPLY_STAGES.includes(deal.stage)
  ) {
    return { kind: "none" };
  }
  const dueAt = new Date(deal.first_response_due_at);
  const lateMs = now.getTime() - dueAt.getTime();
  return lateMs > 0
    ? { kind: "overdue", dueAt, lateMs }
    : { kind: "pending", dueAt };
};

/** What has to happen on the server when a card is dropped on a stage. */
export type MovePlan =
  | { kind: "noop" }
  | { kind: "blocked"; reason: string }
  | { kind: "ask-handoff" }
  | { kind: "ask-contract" }
  | { kind: "ask-reason" }
  | { kind: "release" }
  | { kind: "claim" }
  | { kind: "claim-then-move" }
  | { kind: "move" };

export const planMove = (
  deal: Pick<Deal, "stage" | "sales_id">,
  toStage: string,
  options: { sameColumnReorder?: boolean } = {},
): MovePlan => {
  const sameStage = deal.stage === toStage;
  if (sameStage && !options.sameColumnReorder) {
    return { kind: "noop" };
  }
  if (!sameStage) {
    // A deal in production only goes on to won, a won deal stays won
    if (deal.stage === "won")
      return { kind: "blocked", reason: "won_is_final" };
    if (deal.stage === "sent-to-production" && toStage !== "won") {
      return { kind: "blocked", reason: "in_production_locked" };
    }
    if (toStage === "sent-to-production") {
      return deal.stage === "contract-signed"
        ? { kind: "ask-handoff" }
        : { kind: "blocked", reason: "contract_required" };
    }
    if (toStage === "won") {
      return deal.stage === "sent-to-production"
        ? { kind: "move" }
        : { kind: "blocked", reason: "won_requires_ready_order" };
    }
    if (toStage === "contract-signed") return { kind: "ask-contract" };
  }
  if (toStage === "lost" && deal.stage !== "lost") {
    return { kind: "ask-reason" };
  }
  const unassigned = deal.sales_id == null;
  if (toStage === "opportunity") {
    if (unassigned)
      return { kind: options.sameColumnReorder ? "move" : "noop" };
    return { kind: "release" };
  }
  if (unassigned) {
    return toStage === "to-contact"
      ? { kind: "claim" }
      : { kind: "claim-then-move" };
  }
  return { kind: "move" };
};

/**
 * The card that must follow the moved one, found by identity and not by screen index,
 * so that a filtered or paginated board cannot corrupt the order.
 */
export const getNeighborId = <T extends { id: unknown }>(
  column: T[],
  movedId: unknown,
  destinationIndex: number,
): T["id"] | null => {
  const withoutMoved = column.filter((deal) => deal.id !== movedId);
  return withoutMoved[destinationIndex]?.id ?? null;
};

const KNOWN_ERRORS = new Set([
  "refund_exceeds_paid",
  "invalid_amount",
  "invalid_kind",
  "payment_in_future",
  "handoff_required",
  "in_production_locked",
  "won_requires_ready_order",
  "contract_required",
  "invalid_link",
  "product_name_required",
  "invalid_file",
  "invalid_materials",
  "claim_required",
  "won_requires_handoff",
  "won_is_final",
  "only_head_reopens_lost",
  "reason_required",
  "not_your_deal",
  "forbidden",
  "use_release",
  "release_not_allowed_in_stage",
  "invalid_assignee",
  "deal_closed",
]);

export type CommandErrorView =
  | { conflict: true; messageKey: string }
  | { conflict: false; messageKey: string; code?: string };

export const describeCommandError = (code: string): CommandErrorView => {
  if (code === "deal_already_assigned") {
    return { conflict: true, messageKey: "crm.board.conflict_taken" };
  }
  if (code === "deal_version_conflict" || code === "order_version_conflict") {
    return { conflict: true, messageKey: "crm.board.conflict_version" };
  }
  if (code === "deal_not_found" || code === "order_not_found") {
    return { conflict: true, messageKey: "crm.board.not_found" };
  }
  if (KNOWN_ERRORS.has(code)) {
    return { conflict: false, messageKey: `crm.board.errors.${code}` };
  }
  return { conflict: false, messageKey: "crm.board.error_generic", code };
};
