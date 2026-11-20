import { describe, expect, it } from "vitest";

import { isOrderLate, planOrderMove } from "./orderBoardUtils";

const today = new Date("2026-11-20T12:00:00");

describe("isOrderLate", () => {
  it("is late when the due date has passed and the order is not ready", () => {
    expect(
      isOrderLate({ stage: "in-progress", due_date: "2026-11-19" }, today),
    ).toBe(true);
  });

  it("is not late today, without a date, or once the order is ready", () => {
    expect(
      isOrderLate({ stage: "accepted", due_date: "2026-11-20" }, today),
    ).toBe(false);
    expect(isOrderLate({ stage: "accepted", due_date: null }, today)).toBe(
      false,
    );
    expect(isOrderLate({ stage: "ready", due_date: "2026-01-01" }, today)).toBe(
      false,
    );
  });
});

describe("planOrderMove", () => {
  it("moves to another column, including back from ready", () => {
    expect(planOrderMove({ stage: "accepted" }, "in-progress")).toEqual({
      kind: "move",
      toStage: "in-progress",
    });
    expect(planOrderMove({ stage: "ready" }, "in-progress")).toEqual({
      kind: "move",
      toStage: "in-progress",
    });
  });

  it("does nothing for the same or an unknown column", () => {
    expect(planOrderMove({ stage: "ready" }, "ready")).toEqual({
      kind: "noop",
    });
    expect(planOrderMove({ stage: "ready" }, "won")).toEqual({ kind: "noop" });
  });
});
