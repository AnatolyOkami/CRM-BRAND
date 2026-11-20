import {
  DragDropContext,
  Droppable,
  type OnDragEndResponder,
} from "@hello-pangea/dnd";
import { useGetIdentity, useListContext, useTranslate } from "ra-core";
import { Fragment, useCallback, useRef } from "react";

import { hasSalesRole, isSalesHead } from "../providers/commons/canAccess";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { getNeighborId } from "./boardUtils";
import { DealColumn } from "./DealColumn";
import { useDealBoardCommands } from "./useDealBoardCommands";

export const HANDOFF_DROPPABLE_ID = "handoff";

/**
 * The sales board. Every column loads its own page of cards, so a long queue never hides behind the
 * first hundred cards; every move is one server command (claim, transition, release).
 */
export const DealListContent = () => {
  const { dealStages } = useConfigurationContext();
  const { filterValues } = useListContext();
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  const commands = useDealBoardCommands();

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

    if (destination.droppableId === HANDOFF_DROPPABLE_ID) {
      commands.moveDeal(deal, "won");
      return;
    }

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
          {dealStages.map((stage) => (
            <Fragment key={stage.value}>
              {stage.value === "won" && (
                <HandoffDropZone
                  label={translate("crm.board.handoff_zone")}
                  hint={translate("crm.board.handoff_hint")}
                />
              )}
              <DealColumn
                stage={stage.value}
                label={stage.label}
                filterValues={filterValues}
                commands={commands}
                viewer={viewer}
                onData={onData}
              />
            </Fragment>
          ))}
        </div>
      </DragDropContext>
      {commands.lostDialog}
    </>
  );
};

// Opens the production handoff. In this stage of the project it only explains that the form is
// not there yet, and the card stays where it was.
const HandoffDropZone = ({ label, hint }: { label: string; hint: string }) => (
  <div className="flex w-40 shrink-0 flex-col pb-8">
    <h3 className="text-center text-base font-medium">{label}</h3>
    <Droppable droppableId={HANDOFF_DROPPABLE_ID}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`mt-2 flex min-h-32 flex-1 items-center justify-center rounded-2xl border-2 border-dashed p-3 text-center text-xs text-muted-foreground ${
            snapshot.isDraggingOver ? "border-primary bg-muted" : ""
          }`}
        >
          {hint}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  </div>
);
