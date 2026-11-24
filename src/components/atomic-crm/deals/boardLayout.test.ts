import { describe, expect, it } from "vitest";

import { BOARD_GROUPS, getVisibleGroups } from "./boardLayout";

const ids = (groups: { id: string }[]) => groups.map((group) => group.id);

describe("BOARD_GROUPS", () => {
  it("keeps the order of the technical task, whatever is in the groups", () => {
    expect(ids(BOARD_GROUPS)).toEqual([
      "sales",
      "design",
      "typography",
      "wide-format",
      "signs",
      "installation",
      "completion",
    ]);
    expect(BOARD_GROUPS.map((g) => g.columns.map((c) => c.id))).toEqual([
      ["opportunity", "processing", "order"],
      [
        "design-task",
        "design-in-progress",
        "design-ready",
        "approval",
        "approved",
      ],
      ["typography-in-progress", "typography-done"],
      ["wide-format-in-progress", "wide-format-done"],
      ["signs-in-progress", "signs-done"],
      ["install-to-plan", "install-planned", "install-done"],
      ["won", "lost"],
    ]);
  });

  it("has no column for the sending to production or for the retired stages", () => {
    const stages = BOARD_GROUPS.flatMap((g) => g.columns).flatMap((c) =>
      c.kind === "stage" ? [c.stage] : [],
    );

    for (const retired of ["sent-to-production", "proposal-sent", "delayed"]) {
      expect(stages).not.toContain(retired);
    }
  });
});

describe("getVisibleGroups", () => {
  it("shows the whole line to the manager, the office head and the owner", () => {
    for (const role of ["manager", "office_head", "owner"] as const) {
      expect(ids(getVisibleGroups([role]))).toHaveLength(7);
    }
    expect(ids(getVisibleGroups(undefined))).toHaveLength(7);
  });

  it("shows the designer the design part only", () => {
    expect(ids(getVisibleGroups(["designer"]))).toEqual(["design"]);
  });

  it("shows a workshop employee only the own workshop", () => {
    expect(ids(getVisibleGroups(["shop_signs"]))).toEqual(["signs"]);
    expect(ids(getVisibleGroups(["shop_typography", "shop_signs"]))).toEqual([
      "typography",
      "signs",
    ]);
  });

  it("shows the installer the installation only", () => {
    expect(ids(getVisibleGroups(["installer"]))).toEqual(["installation"]);
  });

  it("shows nothing without a role", () => {
    expect(getVisibleGroups([])).toEqual([]);
  });
});
