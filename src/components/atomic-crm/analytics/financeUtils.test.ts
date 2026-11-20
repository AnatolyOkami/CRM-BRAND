import { describe, expect, it } from "vitest";

import {
  emptyFinanceFilters,
  formatRub,
  getBalanceView,
  getClosingDateView,
  toListFilter,
  toSummaryArgs,
} from "./financeUtils";

const stages = ["opportunity", "in-work", "contract-signed", "won", "lost"];
const today = new Date("2026-11-20T12:00:00");

describe("getBalanceView", () => {
  it("shows what is left, a settled deal and an overpayment", () => {
    expect(getBalanceView(55000)).toEqual({ kind: "due", value: 55000 });
    expect(getBalanceView(0)).toEqual({ kind: "settled" });
    expect(getBalanceView(-20000)).toEqual({ kind: "overpaid", value: 20000 });
  });

  it("calculates nothing while the amount is unknown", () => {
    expect(getBalanceView(null)).toEqual({ kind: "unknown" });
  });
});

describe("getClosingDateView", () => {
  it("marks an open deal with a past date as overdue", () => {
    expect(getClosingDateView("in-work", "2026-11-19", today)).toEqual({
      kind: "overdue",
      date: "2026-11-19",
    });
  });

  it("does not mark today, the future, or a closed deal", () => {
    expect(getClosingDateView("in-work", "2026-11-20", today).kind).toBe(
      "date",
    );
    expect(getClosingDateView("in-work", "2026-12-01", today).kind).toBe(
      "date",
    );
    expect(getClosingDateView("won", "2026-01-01", today).kind).toBe("date");
    expect(getClosingDateView("lost", "2026-01-01", today).kind).toBe("date");
  });

  it("shows an empty date as not assigned", () => {
    expect(getClosingDateView("in-work", null, today)).toEqual({
      kind: "unassigned",
    });
  });
});

describe("filters", () => {
  it("builds the same selection for the table and for the totals", () => {
    const filters = {
      ...emptyFinanceFilters,
      status: "open",
      salesId: 4,
      closingFrom: "2026-11-01",
      closingTo: "2026-11-30",
    };
    expect(toListFilter(filters, stages)).toEqual({
      "archived_at@is": null,
      "stage@in": "(opportunity,in-work,contract-signed)",
      sales_id: 4,
      "expected_closing_date@gte": "2026-11-01",
      "expected_closing_date@lte": "2026-11-30",
    });
    expect(toSummaryArgs(filters, stages)).toEqual({
      stages: ["opportunity", "in-work", "contract-signed"],
      salesId: 4,
      closingFrom: "2026-11-01",
      closingTo: "2026-11-30",
    });
  });

  it("selects nothing extra when no filter is set, and one stage when it is picked", () => {
    expect(toListFilter(emptyFinanceFilters, stages)).toEqual({
      "archived_at@is": null,
    });
    expect(toSummaryArgs(emptyFinanceFilters, stages).stages).toBeNull();
    expect(
      toSummaryArgs({ ...emptyFinanceFilters, status: "won" }, stages).stages,
    ).toEqual(["won"]);
  });
});

describe("formatRub", () => {
  it("writes whole rubles", () => {
    expect(formatRub(45000)).toMatch(/45\s000\s₽/);
  });
});
