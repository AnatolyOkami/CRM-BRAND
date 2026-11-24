import { describe, expect, it } from "vitest";

import type { LeadSource } from "../types";
import {
  getSelectableSources,
  getSourceLabel,
  nextSourcePosition,
  slugifySourceCode,
} from "./leadSourceUtils";

const source = (
  code: string,
  position: number,
  is_active = true,
): LeadSource => ({
  id: position,
  code,
  label: code.toUpperCase(),
  is_active,
  position,
});

const SOURCES = [
  source("b", 20),
  source("a", 10),
  source("old", 900, false),
  source("c", 30),
];

describe("getSourceLabel", () => {
  it("returns the label of the list, then the fallback, then the code", () => {
    expect(getSourceLabel(SOURCES, "a")).toBe("A");
    expect(getSourceLabel(SOURCES, "x", "Другое")).toBe("Другое");
    expect(getSourceLabel(SOURCES, "x")).toBe("x");
  });
});

describe("getSelectableSources", () => {
  it("offers the active sources in the order of the list", () => {
    expect(getSelectableSources(SOURCES).map((s) => s.code)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps the retired source that the deal already has", () => {
    expect(getSelectableSources(SOURCES, "old").map((s) => s.code)).toEqual([
      "a",
      "b",
      "c",
      "old",
    ]);
  });
});

describe("nextSourcePosition", () => {
  it("puts a new source after the last active one, ignoring the retired", () => {
    expect(nextSourcePosition(SOURCES)).toBe(40);
    expect(nextSourcePosition([])).toBe(10);
  });
});

describe("slugifySourceCode", () => {
  it("turns a russian label into a code of latin letters and hyphens", () => {
    expect(slugifySourceCode("Выставка Реклама-2026")).toBe(
      "vystavka-reklama-2026",
    );
    expect(slugifySourceCode("  2ГИС ")).toBe("2gis");
  });

  it("returns an empty string when nothing usable is left and cuts long labels", () => {
    expect(slugifySourceCode("!!!")).toBe("");
    expect(slugifySourceCode("a".repeat(60)).length).toBe(40);
  });
});
