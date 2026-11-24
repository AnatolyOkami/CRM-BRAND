import { describe, expect, it } from "vitest";

import {
  defaultRecallAt,
  toRecallIso,
  validateCallResult,
} from "./callResultUtils";

const NOW = new Date(2026, 10, 24, 15, 30);

describe("defaultRecallAt", () => {
  it("proposes tomorrow at ten in the morning", () => {
    expect(defaultRecallAt(NOW)).toBe("2026-11-25T10:00");
  });

  it("rolls over the end of the month", () => {
    expect(defaultRecallAt(new Date(2026, 11, 31, 23, 0))).toBe(
      "2027-01-01T10:00",
    );
  });
});

describe("validateCallResult", () => {
  it("needs the result of the call", () => {
    const errors = validateCallResult(
      { result: "   ", recallEnabled: false, recallAt: "" },
      NOW,
    );

    expect(errors).toEqual({ result: "crm.call_dialog.result_required" });
  });

  it("accepts a result without a call back", () => {
    expect(
      validateCallResult(
        { result: "Ждёт расчёт", recallEnabled: false, recallAt: "" },
        NOW,
      ),
    ).toEqual({});
  });

  it("asks for the moment of the call back when it is switched on", () => {
    const errors = validateCallResult(
      { result: "Ждёт", recallEnabled: true, recallAt: "" },
      NOW,
    );

    expect(errors.recallAt).toBe("crm.call_dialog.recall_required");
  });

  it("refuses a call back in the past but tolerates a few minutes", () => {
    const past = validateCallResult(
      { result: "Ждёт", recallEnabled: true, recallAt: "2026-11-24T10:00" },
      NOW,
    );
    const justNow = validateCallResult(
      { result: "Ждёт", recallEnabled: true, recallAt: "2026-11-24T15:27" },
      NOW,
    );

    expect(past.recallAt).toBe("crm.call_dialog.recall_in_past");
    expect(justNow).toEqual({});
  });
});

describe("toRecallIso", () => {
  it("sends the moment only when the call back is switched on", () => {
    const on = toRecallIso({
      result: "x",
      recallEnabled: true,
      recallAt: "2026-11-25T10:00",
    });
    const off = toRecallIso({
      result: "x",
      recallEnabled: false,
      recallAt: "2026-11-25T10:00",
    });

    expect(on).toBe(new Date(2026, 10, 25, 10, 0).toISOString());
    expect(off).toBeNull();
  });
});
