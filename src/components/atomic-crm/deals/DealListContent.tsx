import { DragDropContext, type OnDragEndResponder } from "@hello-pangea/dnd";
import {
  useGetIdentity,
  useGetList,
  useListContext,
  useTranslate,
} from "ra-core";
import { useCallback, useRef } from "react";

import { hasSalesRole, isSalesHead } from "../providers/commons/canAccess";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { getNeighborId } from "./boardUtils";
import { BoardScroller } from "./BoardScroller";
import { getVisibleGroups, type BoardGroup } from "./boardLayout";
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
  const translate = useTranslate();
  const stageLabel = (stage: string) =>
    findDealLabel(dealStages, stage) ?? stage;
  const visible = getVisibleGroups(identity?.roles);
  const groups: BoardGroup[] =
    (legacyTotal ?? 0) > 0
      ? visible.map((group) =>
          group.id === "sales"
            ? {
                ...group,
                columns: [
                  ...group.columns,
                  {
                    id: "contract-signed",
                    kind: "stage" as const,
                    stage: "contract-signed",
                  },
                ],
              }
            : group,
        )
      : visible;

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
        <BoardScroller
          groups={groups.map((group) => ({
            id: group.id,
            label: translate(group.labelKey),
          }))}
        >
          {groups.map((group) => (
            <section
              key={group.id}
              data-board-group={group.id}
              aria-label={translate(group.labelKey)}
              className="flex shrink-0 flex-col gap-2 rounded-xl bg-muted/40 px-3 pb-2 pt-2"
            >
              <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {translate(group.labelKey)}
              </h2>
              <div className="flex gap-3">
                {group.columns.map((column) =>
                  column.kind === "stage" ? (
                    <DealColumn
                      key={column.id}
                      stage={column.stage}
                      label={stageLabel(column.stage)}
                      filterValues={filterValues}
                      commands={commands}
                      viewer={viewer}
                      onData={onData}
                    />
                  ) : (
                    <CardColumn
                      key={column.id}
                      label={translate(column.labelKey)}
                    />
                  ),
                )}
              </div>
            </section>
          ))}
        </BoardScroller>
      </DragDropContext>
      {commands.lostDialog}
    </>
  );
};

/** A column of the cards of a workshop or of the installation: they come with the next stages of the work. */
const CardColumn = ({ label }: { label: string }) => (
  <div className="flex w-72 shrink-0 flex-col pb-8">
    <div className="flex flex-col items-center">
      <h3 className="text-base font-medium">
        {label}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          0
        </span>
      </h3>
      <p className="text-sm text-muted-foreground"> </p>
    </div>
    <div className="mt-2 min-h-24 rounded-2xl border border-dashed" />
  </div>
);
