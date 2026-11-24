import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

import {
  activeGroupIndex,
  dragToScrollLeft,
  type GroupSpan,
  isInteractiveTarget,
  wheelToScrollLeft,
} from "./boardScroll";

export interface ScrollerGroup {
  id: string;
  label: string;
}

/**
 * The scroll container of the single board. The horizontal scrollbar is pinned above the board and
 * follows it; the vertical wheel over the board moves it sideways; the mouse drags it by the empty
 * area; on a phone a switcher jumps to a group. The groups are marked with data-board-group.
 */
export const BoardScroller = ({
  groups,
  children,
}: {
  groups: ScrollerGroup[];
  children: ReactNode;
}) => {
  const content = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const syncing = useRef<"top" | "content" | null>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const [panning, setPanning] = useState(false);

  const spans = useCallback((): GroupSpan[] => {
    const root = content.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>("[data-board-group]"),
    ).map((el) => ({
      start: el.offsetLeft,
      end: el.offsetLeft + el.offsetWidth,
    }));
  }, []);

  // the scrollbar above the board is as wide as the board
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const update = () => setWidth(el.scrollWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // the vertical wheel moves the board sideways; the listener must not be passive to prevent the page scroll
  useEffect(() => {
    const el = content.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const next = wheelToScrollLeft(el, event);
      if (next === null) return;
      event.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onContentScroll = () => {
    const el = content.current;
    if (!el) return;
    setActive(activeGroupIndex(spans(), el.scrollLeft, el.clientWidth));
    if (syncing.current === "top") {
      syncing.current = null;
      return;
    }
    syncing.current = "content";
    if (topBar.current) topBar.current.scrollLeft = el.scrollLeft;
  };

  const onTopScroll = () => {
    if (syncing.current === "content") {
      syncing.current = null;
      return;
    }
    syncing.current = "top";
    if (content.current && topBar.current) {
      content.current.scrollLeft = topBar.current.scrollLeft;
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = content.current;
    // a finger scrolls natively; a card, a button or a field keeps its own behavior
    if (
      !el ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      isInteractiveTarget(event.target as Element)
    ) {
      return;
    }
    const startX = event.clientX;
    const startLeft = el.scrollLeft;
    setPanning(true);
    const onMove = (move: PointerEvent) => {
      el.scrollLeft = dragToScrollLeft(el, startLeft, startX, move.clientX);
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const goTo = (index: number) => {
    const left = spans()[index]?.start;
    if (left !== undefined) {
      setActive(index);
      content.current?.scrollTo({ left, behavior: "smooth" });
    }
  };

  return (
    <div className="flex flex-col">
      <nav
        className="flex gap-1 overflow-x-auto pb-2 md:hidden"
        aria-label="board groups"
      >
        {groups.map((group, index) => (
          <button
            key={group.id}
            type="button"
            aria-current={index === active ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm",
              index === active
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background",
            )}
            onClick={() => goTo(index)}
          >
            {group.label}
          </button>
        ))}
      </nav>
      <div
        ref={topBar}
        data-testid="board-top-scrollbar"
        className="sticky top-0 z-10 overflow-x-scroll overflow-y-hidden bg-background [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-muted"
        onScroll={onTopScroll}
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div
        ref={content}
        data-testid="board-content"
        className={cn(
          "overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          panning ? "cursor-grabbing select-none" : "cursor-grab",
        )}
        onScroll={onContentScroll}
        onPointerDown={onPointerDown}
      >
        <div ref={inner} className="relative flex w-max gap-6 pr-4">
          {children}
        </div>
      </div>
    </div>
  );
};
