import { describe, expect, it } from "vitest";

import {
  describeCommandError,
  getNeighborId,
  getReplyStatus,
  planMove,
} from "./boardUtils";

const now = new Date("2026-11-20T12:00:00.000Z");

describe("getReplyStatus", () => {
  it("is overdue after the deadline when nobody answered", () => {
    const status = getReplyStatus(
      {
        stage: "opportunity",
        first_response_due_at: "2026-11-20T11:00:00.000Z",
        first_responded_at: null,
      },
      now,
    );
    expect(status).toMatchObject({ kind: "overdue", lateMs: 3600_000 });
  });

  it("is pending before the deadline", () => {
    const status = getReplyStatus(
      {
        stage: "processing",
        first_response_due_at: "2026-11-20T13:00:00.000Z",
        first_responded_at: null,
      },
      now,
    );
    expect(status.kind).toBe("pending");
  });

  it("is replied once the first reply is registered", () => {
    const status = getReplyStatus(
      {
        stage: "contacted",
        first_response_due_at: "2026-11-20T11:00:00.000Z",
        first_responded_at: "2026-11-20T11:30:00.000Z",
      },
      now,
    );
    expect(status.kind).toBe("replied");
  });

  it("ignores deals that are further in the funnel or historical", () => {
    expect(
      getReplyStatus(
        {
          stage: "in-work",
          first_response_due_at: "2026-11-20T11:00:00.000Z",
          first_responded_at: null,
        },
        now,
      ).kind,
    ).toBe("none");
    expect(
      getReplyStatus(
        {
          stage: "opportunity",
          first_response_due_at: "2026-11-20T11:00:00.000Z",
          first_responded_at: null,
          is_historical: true,
        },
        now,
      ).kind,
    ).toBe("none");
  });
});

describe("planMove", () => {
  it("moves to won only from production", () => {
    expect(
      planMove({ stage: "sent-to-production", sales_id: 1 }, "won"),
    ).toEqual({ kind: "move" });
    expect(planMove({ stage: "order", sales_id: 1 }, "won")).toEqual({
      kind: "blocked",
      reason: "won_requires_ready_order",
    });
  });

  it("opens the handoff from the order stage, and from the old signed contract stage", () => {
    expect(
      planMove({ stage: "order", sales_id: 1 }, "sent-to-production"),
    ).toEqual({ kind: "ask-handoff" });
    expect(
      planMove({ stage: "contract-signed", sales_id: 1 }, "sent-to-production"),
    ).toEqual({ kind: "ask-handoff" });
    expect(
      planMove({ stage: "processing", sales_id: 1 }, "sent-to-production"),
    ).toEqual({ kind: "blocked", reason: "order_stage_required" });
  });

  it("opens the handoff from the approval stages too", () => {
    for (const stage of ["approval", "approved"]) {
      expect(planMove({ stage, sales_id: 1 }, "sent-to-production")).toEqual({
        kind: "ask-handoff",
      });
    }
    expect(
      planMove({ stage: "design-ready", sales_id: 1 }, "sent-to-production"),
    ).toEqual({ kind: "blocked", reason: "order_stage_required" });
  });

  it("moves a deal through the design stages", () => {
    for (const to of [
      "design-task",
      "design-in-progress",
      "design-ready",
      "approval",
      "approved",
    ]) {
      expect(planMove({ stage: "order", sales_id: 1 }, to)).toEqual({
        kind: "move",
      });
    }
  });

  it("never lets a deal enter a stage of the old pipeline", () => {
    for (const stage of [
      "proposal-sent",
      "delayed",
      "to-contact",
      "contacted",
      "in-work",
      "in-negociation",
      "contract-signed",
    ]) {
      expect(planMove({ stage: "processing", sales_id: 1 }, stage)).toEqual({
        kind: "blocked",
        reason: "invalid_stage",
      });
    }
  });

  it("lets an old deal leave the signed contract stage", () => {
    expect(
      planMove({ stage: "contract-signed", sales_id: 1 }, "order"),
    ).toEqual({ kind: "move" });
  });

  it("keeps a deal in production there", () => {
    expect(
      planMove({ stage: "sent-to-production", sales_id: 1 }, "processing"),
    ).toEqual({ kind: "blocked", reason: "in_production_locked" });
    expect(planMove({ stage: "won", sales_id: 1 }, "processing")).toEqual({
      kind: "blocked",
      reason: "won_is_final",
    });
  });

  it("asks for a reason before closing", () => {
    expect(planMove({ stage: "processing", sales_id: 1 }, "lost")).toEqual({
      kind: "ask-reason",
    });
  });

  it("takes an unassigned deal when it is dropped on processing", () => {
    expect(
      planMove({ stage: "opportunity", sales_id: null }, "processing"),
    ).toEqual({ kind: "claim" });
    expect(planMove({ stage: "opportunity", sales_id: null }, "order")).toEqual(
      { kind: "claim-then-move" },
    );
  });

  it("returns an owned deal to the queue when it is dropped on new requests", () => {
    expect(
      planMove({ stage: "processing", sales_id: 3 }, "opportunity"),
    ).toEqual({ kind: "release" });
  });

  it("does nothing for the same column unless the order changes", () => {
    expect(planMove({ stage: "order", sales_id: 1 }, "order")).toEqual({
      kind: "noop",
    });
    expect(
      planMove({ stage: "order", sales_id: 1 }, "order", {
        sameColumnReorder: true,
      }),
    ).toEqual({ kind: "move" });
  });
});

describe("getNeighborId", () => {
  const column = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("returns the card that will follow the moved one", () => {
    expect(getNeighborId(column, 99, 1)).toBe(2);
  });

  it("ignores the moved card when it is in the same column", () => {
    // 1 is dragged below 2: the list without 1 is [2, 3], index 1 is 3
    expect(getNeighborId(column, 1, 1)).toBe(3);
  });

  it("returns null after the last card", () => {
    expect(getNeighborId(column, 99, 3)).toBeNull();
  });
});

describe("describeCommandError", () => {
  it("treats races as conflicts that refresh the board", () => {
    expect(describeCommandError("deal_already_assigned").conflict).toBe(true);
    expect(describeCommandError("deal_version_conflict").conflict).toBe(true);
  });

  it("treats a race on the order as a conflict that refreshes the data", () => {
    expect(describeCommandError("order_version_conflict").conflict).toBe(true);
  });

  it("maps business rules to messages", () => {
    expect(describeCommandError("claim_required")).toEqual({
      conflict: false,
      messageKey: "crm.board.errors.claim_required",
    });
  });

  it("keeps the code of unknown errors", () => {
    expect(describeCommandError("weird")).toEqual({
      conflict: false,
      messageKey: "crm.board.error_generic",
      code: "weird",
    });
  });
});
