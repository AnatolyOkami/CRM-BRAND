import { DragDropContext, type OnDragEndResponder } from "@hello-pangea/dnd";
import { useGetIdentity, useGetList, useListContext } from "ra-core";
import { useCallback, useRef } from "react";

import { hasSalesRole, isSalesHead } from "../providers/commons/canAccess";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { getNeighborId } from "./boardUtils";
import { DealColumn } from "./DealColumn";
import { findDealLabel } from "./dealUtils";
import { useDealBoardCommands } from "./useDealBoardCommands";

/**
 * The sales board. Every column loads its own page of cards, so a long queue never hides behind the
 * first hundred cards; every move is one server command (claim, transition, release).
 */
export const DealListContent = () => {
  const { dealStages } = useConfigurationContext();
  const { filterValues } = useListContext();
  const { identity } = useGetIdentity();
  const commands = useDealBoardCommands();

  // Old deals that signed a contract in the first pipeline: their column exists while they wait
  const { total: legacyTotal } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "id", order: "ASC" },
    filter: { stage: "contract-signed", "archived_at@is": null },
  });
  const columnStages =
    (legacyTotal ?? 0) > 0
      ? [
          ...dealStages,
          {
            value: "contract-signed",
            label: findDealLabel([], "contract-signed") ?? "contract-signed",
          },
        ]
      : dealStages;

  // The cards each column currently shows, read when a card is dropped
  const columns = useRef<Record<string, Deal[]>>({});
  const onData = useCallback((stage: string, deals: Deal[]) => {
    columns.current[stage] = deals;
  }, []);

  const viewer = {
    salesId: identity?.id,
    isHead: isSalesHead(identity?.roles),
    canSell: hasSalesRole(identity?.roles),
  };

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    const deal = columns.current[source.droppableId]?.find(
      (candidate) => String(candidate.id) === draggableId,
    );
    if (!deal) return;

    const toStage = destination.droppableId;
    const sameColumn = toStage === source.droppableId;
    if (sameColumn && destination.index === source.index) return;

    commands.moveDeal(deal, toStage, {
      sameColumnReorder: sameColumn,
      beforeDealId: getNeighborId(
        columns.current[toStage] ?? [],
        deal.id,
        destination.index,
      ),
    });
  };

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columnStages.map((stage) => (
            <DealColumn
              key={stage.value}
              stage={stage.value}
              label={stage.label}
              filterValues={filterValues}
              commands={commands}
              viewer={viewer}
              onData={onData}
            />
          ))}
        </div>
      </DragDropContext>
      {commands.lostDialog}
    </>
  );
};
