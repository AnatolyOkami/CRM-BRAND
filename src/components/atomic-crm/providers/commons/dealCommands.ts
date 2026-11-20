import type { Identifier } from "ra-core";

/**
 * Error raised by the deal commands (claim, transition, assign, create).
 * `code` is the machine readable message of the database, e.g. deal_already_assigned.
 */
export class DealCommandError extends Error {
  code: string;
  status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "DealCommandError";
    this.code = code;
    this.status = status;
  }
}

/** Codes after which the board must reload its data: somebody else changed the deal first. */
export const isConflictCode = (code: string) =>
  code === "deal_already_assigned" ||
  code === "deal_version_conflict" ||
  code === "deal_not_found";

/** One key per user action: a retry or a double submit of the same action is executed once. */
export const newRequestKey = (): string => crypto.randomUUID();

export type TransitionDealParams = {
  dealId: Identifier;
  expectedVersion: number;
  toStage: string;
  /** The card that must follow the moved one in the target column. */
  beforeDealId?: Identifier | null;
  reason?: string;
  requestKey?: string;
};

export type AssignDealParams = {
  dealId: Identifier;
  expectedVersion: number;
  /** null returns the deal to the shared queue */
  toSalesId: Identifier | null;
  reason?: string;
  requestKey?: string;
};
