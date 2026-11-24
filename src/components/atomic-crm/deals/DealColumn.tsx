import { Droppable } from "@hello-pangea/dnd";
import { keepPreviousData } from "@tanstack/react-query";
import { useGetList, useTranslate } from "ra-core";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal, ProductionOrder, Task } from "../types";
import { DealCard, type DealCardViewer } from "./DealCard";
import type { useDealBoardCommands } from "./useDealBoardCommands";

const PAGE_SIZE = 25;

export const DealColumn = ({
  stage,
  label,
  filterValues,
  commands,
  viewer,
  onData,
}: {
  stage: string;
  label: string;
  filterValues: Record<string, unknown>;
  commands: ReturnType<typeof useDealBoardCommands>;
  viewer: DealCardViewer;
  onData: (stage: string, deals: Deal[]) => void;
}) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const [limit, setLimit] = useState(PAGE_SIZE);

  // New requests are sorted by the reply deadline: overdue first, then the oldest arrival.
  // The other columns keep the order chosen by hand.
  const sort =
    stage === "opportunity"
      ? ({ field: "first_response_due_at", order: "ASC" } as const)
      : ({ field: "index", order: "ASC" } as const);

  const { data, total, isPending } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: limit },
      sort,
      filter: { ...filterValues, stage, "archived_at@is": null },
    },
    { placeholderData: keepPreviousData },
  );

  // The unfiltered size of the shared queue: the manager must never miss a waiting request
  const { total: queueTotal } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
      filter: {
        stage: "opportunity",
        "sales_id@is": null,
        "archived_at@is": null,
      },
    },
    { enabled: stage === "opportunity" },
  );

  const deals = useMemo(() => data ?? [], [data]);
  useEffect(() => {
    onData(stage, deals);
  }, [deals, onData, stage]);

  const dealIds = deals.map((deal) => deal.id);
  const { data: openTasks } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "deal_id@in": `(${dealIds.join(",")})`,
        "done_date@is": null,
      },
    },
    { enabled: dealIds.length > 0 },
  );
  const nextTaskByDeal = useMemo(() => {
    const map = new Map<unknown, Task>();
    (openTasks ?? []).forEach((task) => {
      if (task.deal_id != null && !map.has(task.deal_id)) {
        map.set(task.deal_id, task);
      }
    });
    return map;
  }, [openTasks]);

  // The workshop state of the deals that have been sent to production
  const { data: orders } = useGetList<ProductionOrder>(
    "production_orders",
    {
      pagination: { page: 1, perPage: 500 },
      sort: { field: "id", order: "ASC" },
      filter: { "deal_id@in": `(${dealIds.join(",")})` },
    },
    { enabled: dealIds.length > 0 },
  );
  const orderByDeal = useMemo(
    () => new Map((orders ?? []).map((order) => [order.deal_id, order])),
    [orders],
  );

  const allLoaded = total != null && deals.length >= total;
  const totalAmount = deals.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col pb-8">
      <div className="flex flex-col items-center">
        <h3 className="text-base font-medium">
          {label}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {isPending ? "…" : (total ?? deals.length)}
          </span>
        </h3>
        <p className="text-sm text-muted-foreground">
          {allLoaded && totalAmount > 0
            ? totalAmount.toLocaleString("ru-RU", {
                notation: "compact",
                style: "currency",
                currency,
                maximumFractionDigits: 1,
              })
            : " "}
        </p>
        {stage === "opportunity" && (queueTotal ?? 0) > 0 && (
          <p className="text-xs font-medium text-destructive">
            {translate("crm.board.unassigned_count", { count: queueTotal })}
          </p>
        )}
      </div>
      <Droppable droppableId={stage}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`mt-2 flex min-h-24 flex-col gap-2 rounded-2xl ${
              snapshot.isDraggingOver ? "bg-muted" : ""
            }`}
          >
            {deals.map((deal, index) => (
              <DealCard
                key={deal.id}
                deal={deal}
                index={index}
                nextTask={nextTaskByDeal.get(deal.id)}
                order={orderByDeal.get(deal.id)}
                commands={commands}
                viewer={viewer}
              />
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
      {!allLoaded && deals.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
        >
          {translate("crm.board.show_more")} ({deals.length}/{total})
        </Button>
      )}
    </div>
  );
};
