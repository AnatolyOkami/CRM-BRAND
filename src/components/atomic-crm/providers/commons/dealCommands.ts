import type { Identifier } from "ra-core";

import type {
  OrderLink,
  ProductionStage,
  UploadedOrderFile,
} from "../../types";

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

export type CallResultParams = {
  dealId: Identifier;
  /** How the call went */
  result: string;
  /** What was agreed with the customer */
  agreements?: string;
  /** ISO moment of the call back: a task for the manager is planned for it */
  recallAt?: string | null;
  requestKey?: string;
};

export type SetDealSourceParams = {
  dealId: Identifier;
  expectedVersion: number;
  source: string;
  requestKey?: string;
};

export type SaveLeadPartnerParams = {
  /** null creates a new partner */
  id: Identifier | null;
  name: string;
  kind: "partner" | "website";
  source: string;
  isActive: boolean;
};

/** The signing secret is present only when a website connection has just been created. */
export type SavedLeadPartner = {
  id: Identifier;
  code: string;
  kind: "partner" | "website";
  secret: string | null;
};

export type SaveLeadSourceParams = {
  code: string;
  label: string;
  isActive: boolean;
  position: number;
};

export type AssignDealParams = {
  dealId: Identifier;
  expectedVersion: number;
  /** null returns the deal to the shared queue */
  toSalesId: Identifier | null;
  reason?: string;
  requestKey?: string;
};

export type HandoffParams = {
  dealId: Identifier;
  expectedVersion: number;
  productName: string;
  instructions?: string;
  dueDate?: string | null;
  files: UploadedOrderFile[];
  links: OrderLink[];
  requestKey?: string;
};

export type TransitionOrderParams = {
  orderId: Identifier;
  expectedVersion: number;
  toStage: ProductionStage;
  requestKey?: string;
};

/** Result of a workshop transition: notified is true when the manager got a notification. */
export type OrderTransitionResult = {
  order_id: Identifier;
  version: number;
  stage: ProductionStage;
  notified: boolean;
  replayed: boolean;
};

export type PaymentParams = {
  dealId: Identifier;
  kind: "payment" | "refund";
  /** Whole rubles */
  amount: number;
  paidAt?: string;
  comment?: string;
  requestKey?: string;
};

/** Filters of the totals: the same ones the table uses. */
export type FinanceSummaryArgs = {
  stages: string[] | null;
  salesId: Identifier | null;
  closingFrom: string | null;
  closingTo: string | null;
};
