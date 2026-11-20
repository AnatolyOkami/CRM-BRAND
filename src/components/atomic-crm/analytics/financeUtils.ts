import type { FinanceSummaryArgs } from "../providers/commons/dealCommands";

/** Stages of a deal that is no longer in work: lost (closed) and won (finished). */
export const CLOSED_STAGES = ["won", "lost"];

export const isOpenStage = (stage: string) => !CLOSED_STAGES.includes(stage);

/** Whole rubles, the currency of the deals. */
export const formatRub = (value: number, locale = "ru-RU"): string =>
  value.toLocaleString(locale, {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });

export type BalanceView =
  | { kind: "unknown" }
  | { kind: "due"; value: number }
  | { kind: "settled" }
  | { kind: "overpaid"; value: number };

/** The balance is never calculated while the amount of the deal is unknown. */
export const getBalanceView = (balance: number | null): BalanceView => {
  if (balance == null) return { kind: "unknown" };
  if (balance > 0) return { kind: "due", value: balance };
  if (balance < 0) return { kind: "overpaid", value: -balance };
  return { kind: "settled" };
};

export type ClosingDateView =
  | { kind: "unassigned" }
  | { kind: "date"; date: string }
  | { kind: "overdue"; date: string };

/** An open deal whose planned date has passed is overdue; an empty date is "not assigned". */
export const getClosingDateView = (
  stage: string,
  date: string | null,
  today: Date = new Date(),
): ClosingDateView => {
  if (!date) return { kind: "unassigned" };
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const late = new Date(`${date}T00:00:00`) < startOfToday;
  return isOpenStage(stage) && late
    ? { kind: "overdue", date }
    : { kind: "date", date };
};

/** Value of the status filter: everything, the deals in work, or one stage. */
export type StatusFilter = "all" | "open" | (string & {});

export interface FinanceFilters {
  status: StatusFilter;
  salesId: string | number | null;
  closingFrom: string;
  closingTo: string;
}

export const emptyFinanceFilters: FinanceFilters = {
  status: "all",
  salesId: null,
  closingFrom: "",
  closingTo: "",
};

export const statusToStages = (
  status: StatusFilter,
  allStages: string[],
): string[] | null => {
  if (status === "all") return null;
  if (status === "open") return allStages.filter(isOpenStage);
  return [status];
};

/** The same filters for the table (Data API filter) and for the totals (command arguments). */
export const toListFilter = (
  filters: FinanceFilters,
  allStages: string[],
): Record<string, unknown> => {
  const stages = statusToStages(filters.status, allStages);
  return {
    "archived_at@is": null,
    ...(stages ? { "stage@in": `(${stages.join(",")})` } : {}),
    ...(filters.salesId != null ? { sales_id: filters.salesId } : {}),
    ...(filters.closingFrom
      ? { "expected_closing_date@gte": filters.closingFrom }
      : {}),
    ...(filters.closingTo
      ? { "expected_closing_date@lte": filters.closingTo }
      : {}),
  };
};

export const toSummaryArgs = (
  filters: FinanceFilters,
  allStages: string[],
): FinanceSummaryArgs => ({
  stages: statusToStages(filters.status, allStages),
  salesId: filters.salesId,
  closingFrom: filters.closingFrom || null,
  closingTo: filters.closingTo || null,
});
