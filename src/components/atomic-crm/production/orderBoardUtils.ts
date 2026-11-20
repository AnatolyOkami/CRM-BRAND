import type { ProductionOrder, ProductionStage } from "../types";

export const PRODUCTION_STAGES: ProductionStage[] = [
  "accepted",
  "in-progress",
  "ready",
];

/** An unfinished order is late when its due date is before today. */
export const isOrderLate = (
  order: Pick<ProductionOrder, "stage" | "due_date">,
  today: Date = new Date(),
): boolean => {
  if (order.stage === "ready" || !order.due_date) return false;
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(`${order.due_date}T00:00:00`) < startOfToday;
};

export type OrderMovePlan =
  { kind: "noop" } | { kind: "move"; toStage: ProductionStage };

/** Any move between the three columns is allowed; dropping on the same column does nothing. */
export const planOrderMove = (
  order: Pick<ProductionOrder, "stage">,
  toStage: string,
): OrderMovePlan =>
  PRODUCTION_STAGES.includes(toStage as ProductionStage) &&
  order.stage !== toStage
    ? { kind: "move", toStage: toStage as ProductionStage }
    : { kind: "noop" };
