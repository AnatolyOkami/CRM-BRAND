import { describe, expect, it } from "vitest";

import {
  activeGroupIndex,
  dragToScrollLeft,
  maxScrollLeft,
  wheelToScrollLeft,
} from "./boardScroll";

const state = { scrollLeft: 100, scrollWidth: 3000, clientWidth: 1000 };

describe("wheelToScrollLeft", () => {
  it("turns the vertical wheel into a sideways move", () => {
    expect(wheelToScrollLeft(state, { deltaX: 0, deltaY: 120 })).toBe(220);
    expect(wheelToScrollLeft(state, { deltaX: 0, deltaY: -60 })).toBe(40);
  });

  it("stops at the ends and then lets the page scroll", () => {
    expect(
      wheelToScrollLeft(
        { ...state, scrollLeft: 0 },
        { deltaX: 0, deltaY: -50 },
      ),
    ).toBeNull();
    expect(
      wheelToScrollLeft(
        { ...state, scrollLeft: 2000 },
        { deltaX: 0, deltaY: 50 },
      ),
    ).toBeNull();
    expect(
      wheelToScrollLeft(
        { ...state, scrollLeft: 1950 },
        { deltaX: 0, deltaY: 500 },
      ),
    ).toBe(2000);
  });

  it("leaves sideways gestures, zoom and a board that fits the screen alone", () => {
    expect(wheelToScrollLeft(state, { deltaX: 80, deltaY: 20 })).toBeNull();
    expect(
      wheelToScrollLeft(state, { deltaX: 0, deltaY: 100, ctrlKey: true }),
    ).toBeNull();
    expect(
      wheelToScrollLeft(
        { scrollLeft: 0, scrollWidth: 900, clientWidth: 1000 },
        { deltaX: 0, deltaY: 100 },
      ),
    ).toBeNull();
  });
});

describe("dragToScrollLeft", () => {
  it("moves the board against the mouse and stays inside the board", () => {
    expect(dragToScrollLeft(state, 500, 300, 200)).toBe(600);
    expect(dragToScrollLeft(state, 500, 300, 900)).toBe(0);
    expect(dragToScrollLeft(state, 1900, 300, 100)).toBe(2000);
  });
});

describe("maxScrollLeft", () => {
  it("is never negative", () => {
    expect(maxScrollLeft({ scrollWidth: 500, clientWidth: 800 })).toBe(0);
  });
});

describe("activeGroupIndex", () => {
  const spans = [
    { start: 0, end: 900 },
    { start: 920, end: 1800 },
    { start: 1820, end: 2400 },
  ];

  it("names the group in the middle of the screen", () => {
    expect(activeGroupIndex(spans, 0, 390)).toBe(0);
    expect(activeGroupIndex(spans, 800, 390)).toBe(1);
    expect(activeGroupIndex(spans, 2010, 390)).toBe(2);
  });

  it("names the last group at the end of the board, though it cannot reach the left edge", () => {
    // the board is 2400 wide, the screen 390: the last group starts at 1820 but the board stops at 2010
    expect(activeGroupIndex(spans, 2010, 390)).toBe(2);
  });

  it("takes the closest group when the middle is in a gap", () => {
    expect(activeGroupIndex(spans, 725, 390)).toBe(1);
  });
});
