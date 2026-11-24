import { describe, expect, it } from "vitest";

import { composeLostReason, isLostReasonComplete } from "./lostReasons";

describe("isLostReasonComplete", () => {
  it("needs a chosen reason", () => {
    expect(isLostReasonComplete(null, "комментарий")).toBe(false);
    expect(isLostReasonComplete("too-expensive", "")).toBe(true);
  });

  it("needs a comment for the reason 'other'", () => {
    expect(isLostReasonComplete("other", "   ")).toBe(false);
    expect(isLostReasonComplete("other", "Уехал в другой город")).toBe(true);
  });
});

describe("composeLostReason", () => {
  it("stores the label alone, or the label with the comment of the manager", () => {
    expect(composeLostReason("Дорого", "  ")).toBe("Дорого");
    expect(composeLostReason("Дорого", " Нашёл дешевле ")).toBe(
      "Дорого: Нашёл дешевле",
    );
  });
});
