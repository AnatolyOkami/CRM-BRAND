import {
  DragDropContext,
  Draggable,
  Droppable,
  type OnDragEndResponder,
} from "@hello-pangea/dnd";
import { keepPreviousData } from "@tanstack/react-query";
import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { MoreVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { hasProductionRole } from "../providers/commons/canAccess";
import type { ProductionOrder, ProductionStage } from "../types";
import { OrderDialog } from "./OrderDialog";
import { isOrderLate, PRODUCTION_STAGES } from "./orderBoardUtils";
import { useOrderCommands } from "./useOrderCommands";

const PAGE_SIZE = 25;

/** Main page of the workshop: accepted -> in progress -> ready for pickup. */
export const ProductionBoard = () => {
  const translate = useTranslate();
  const { identity, isPending } = useGetIdentity();
  const commands = useOrderCommands();
  const [opened, setOpened] = useState<ProductionOrder | null>(null);
  const columns = useRef<Record<string, ProductionOrder[]>>({});
  const onData = useCallback((stage: string, orders: ProductionOrder[]) => {
    columns.current[stage] = orders;
  }, []);

  if (isPending) return null;
  if (!hasProductionRole(identity?.roles)) {
    return (
      <p className="mt-8 text-center text-muted-foreground">
        {translate("ra.message.not_authorized", { _: "Access denied" })}
      </p>
    );
  }

  const onDragEnd: OnDragEndResponder = ({
    destination,
    source,
    draggableId,
  }) => {
    if (!destination) return;
    const order = columns.current[source.droppableId]?.find(
      (candidate) => String(candidate.id) === draggableId,
    );
    if (order) void commands.moveOrder(order, destination.droppableId);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {translate("crm.production.title")}
      </h1>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-3">
          {PRODUCTION_STAGES.map((stage) => (
            <ProductionColumn
              key={stage}
              stage={stage}
              busy={commands.busy}
              onData={onData}
              onOpen={setOpened}
              onMove={commands.moveOrder}
            />
          ))}
        </div>
      </DragDropContext>
      <OrderDialog order={opened} onClose={() => setOpened(null)} />
    </div>
  );
};

const ProductionColumn = ({
  stage,
  busy,
  onData,
  onOpen,
  onMove,
}: {
  stage: ProductionStage;
  busy: boolean;
  onData: (stage: string, orders: ProductionOrder[]) => void;
  onOpen: (order: ProductionOrder) => void;
  onMove: (order: ProductionOrder, toStage: string) => void;
}) => {
  const translate = useTranslate();
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Unfinished orders by due date, the ready ones with the latest first
  const sort =
    stage === "ready"
      ? ({ field: "ready_at", order: "DESC" } as const)
      : ({ field: "due_date", order: "ASC" } as const);
  const { data, total } = useGetList<ProductionOrder>(
    "production_orders",
    {
      pagination: { page: 1, perPage: limit },
      sort,
      filter: { stage },
    },
    { placeholderData: keepPreviousData, refetchInterval: 15000 },
  );
  const orders = useMemo(() => data ?? [], [data]);
  useEffect(() => {
    onData(stage, orders);
  }, [onData, orders, stage]);

  return (
    <div className="flex min-w-0 flex-col">
      <h2 className="text-center text-base font-medium">
        {translate(`crm.order.stages.${stage}`)}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {total ?? orders.length}
        </span>
      </h2>
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`mt-2 flex min-h-32 flex-col gap-2 rounded-2xl p-1 ${
              snapshot.isDraggingOver ? "bg-muted" : ""
            }`}
          >
            {orders.length === 0 && (
              <p className="p-3 text-center text-sm text-muted-foreground">
                {translate("crm.production.empty_column")}
              </p>
            )}
            {orders.map((order, index) => (
              <Draggable
                key={order.id}
                draggableId={String(order.id)}
                index={index}
                isDragDisabled={busy}
              >
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                  >
                    <OrderCard
                      order={order}
                      dragging={dragSnapshot.isDragging}
                      onOpen={() => onOpen(order)}
                      onMove={(toStage) => onMove(order, toStage)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      {total != null && orders.length < total && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
        >
          {translate("crm.board.show_more")} ({orders.length}/{total})
        </Button>
      )}
    </div>
  );
};

const OrderCard = ({
  order,
  dragging,
  onOpen,
  onMove,
}: {
  order: ProductionOrder;
  dragging: boolean;
  onOpen: () => void;
  onMove: (toStage: string) => void;
}) => {
  const translate = useTranslate();
  const late = isOrderLate(order);
  return (
    <Card
      className={`cursor-pointer py-3 ${
        dragging ? "rotate-1 opacity-90 shadow-lg" : "shadow-sm hover:shadow-md"
      } ${late ? "border-destructive/60" : ""}`}
      onClick={onOpen}
    >
      <CardContent className="flex flex-col gap-1.5 px-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {translate("crm.order.number", { number: order.id })} ·{" "}
              {order.product_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {order.customer_name || "—"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1 h-6 w-6 shrink-0"
                  aria-label={translate("crm.production.move_to")}
                  onClick={(event) => event.stopPropagation()}
                />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {translate("crm.production.move_to")}
                </DropdownMenuLabel>
                {PRODUCTION_STAGES.filter((stage) => stage !== order.stage).map(
                  (stage) => (
                    <DropdownMenuItem key={stage} onClick={() => onMove(stage)}>
                      {translate(`crm.order.stages.${stage}`)}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {order.instructions && (
          <p className="line-clamp-2 text-xs">{order.instructions}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {order.due_date ? (
            <Badge variant={late ? "destructive" : "outline"}>
              {translate("crm.order.due_date")}: {order.due_date}
            </Badge>
          ) : (
            <span>{translate("crm.order.no_due_date")}</span>
          )}
          <span>
            {order.files_count > 0
              ? translate("crm.handoff.files_count", {
                  count: order.files_count,
                })
              : translate("crm.handoff.files_none")}
            {" · "}
            {order.links_count > 0
              ? translate("crm.handoff.links_count", {
                  count: order.links_count,
                })
              : translate("crm.handoff.links_none")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
