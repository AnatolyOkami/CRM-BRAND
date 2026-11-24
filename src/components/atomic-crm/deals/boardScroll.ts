/** The pure rules of the scrolling of the board: the top scrollbar, the mouse wheel and the drag. */

export interface ScrollState {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export const maxScrollLeft = ({
  scrollWidth,
  clientWidth,
}: Pick<ScrollState, "scrollWidth" | "clientWidth">): number =>
  Math.max(0, scrollWidth - clientWidth);

/**
 * The vertical wheel over the board moves the board sideways. It does so only while the board can
 * go that way: at the end of the board the wheel scrolls the page again, so the page is never trapped.
 */
export const wheelToScrollLeft = (
  state: ScrollState,
  wheel: { deltaX: number; deltaY: number; ctrlKey?: boolean },
): number | null => {
  if (wheel.ctrlKey) return null;
  // a sideways gesture (touchpad, shift + wheel) is already handled by the browser
  if (Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY)) return null;
  const max = maxScrollLeft(state);
  if (max === 0) return null;
  const next = Math.min(max, Math.max(0, state.scrollLeft + wheel.deltaY));
  return next === state.scrollLeft ? null : next;
};

/** The position of the board while the mouse is dragged by the empty area. */
export const dragToScrollLeft = (
  state: ScrollState,
  startScrollLeft: number,
  startX: number,
  currentX: number,
): number =>
  Math.min(
    maxScrollLeft(state),
    Math.max(0, startScrollLeft - (currentX - startX)),
  );

/** The horizontal extent of a group inside the board. */
export interface GroupSpan {
  start: number;
  end: number;
}

/** The group in the middle of the screen: the one the person looks at, also at the end of the board. */
export const activeGroupIndex = (
  spans: GroupSpan[],
  scrollLeft: number,
  clientWidth: number,
): number => {
  const center = scrollLeft + clientWidth / 2;
  const inside = spans.findIndex(
    (span) => center >= span.start && center < span.end,
  );
  if (inside !== -1) return inside;
  // in a gap between two groups: the closest one
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  spans.forEach((span, index) => {
    const d = Math.min(
      Math.abs(center - span.start),
      Math.abs(center - span.end),
    );
    if (d < distance) {
      distance = d;
      closest = index;
    }
  });
  return closest;
};

/** True for the elements the drag must not hijack: cards, buttons, fields. */
export const isInteractiveTarget = (target: Element | null): boolean =>
  target?.closest(
    "[data-rfd-draggable-id], button, a, input, textarea, select, label, [role='menuitem'], [role='dialog']",
  ) != null;
