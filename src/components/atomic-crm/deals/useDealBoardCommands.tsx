import { useQueryClient } from "@tanstack/react-query";
import type { Identifier } from "ra-core";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useState, type ReactNode } from "react";

import { DealCommandError } from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";
import { describeCommandError, planMove } from "./boardUtils";
import { CallResultDialog } from "./CallResultDialog";
import { HandoffDialog } from "./HandoffDialog";
import { LostReasonDialog } from "./LostReasonDialog";

interface MoveOptions {
  beforeDealId?: Identifier | null;
  sameColumnReorder?: boolean;
}

interface PendingClose {
  deal: Deal;
  beforeDealId?: Identifier | null;
}

/**
 * The only way the board changes a deal: every action is one server command, the board is reloaded
 * afterwards whatever the answer was, so that a lost race shows the real state instead of a guess.
 */
export const useDealBoardCommands = (): {
  moveDeal: (deal: Deal, toStage: string, options?: MoveOptions) => void;
  takeDeal: (deal: Deal) => void;
  releaseDeal: (deal: Deal) => void;
  assignDeal: (deal: Deal, salesId: Identifier) => void;
  /** Opens the form where the manager records the result of a call */
  callDeal: (deal: Deal) => void;
  /** Opens the form that sends the deal to production */
  handoffDeal: (deal: Deal) => void;
  busy: boolean;
  /** The dialogs of the actions that ask something first: closing, handoff, call result */
  lostDialog: ReactNode;
} => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<Deal | null>(null);
  const [pendingCall, setPendingCall] = useState<Deal | null>(null);

  const refresh = () =>
    Promise.all(
      [
        "deals",
        "tasks",
        "deal_stage_history",
        "contacts",
        "production_orders",
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );

  const run = async (action: () => Promise<unknown>, successKey?: string) => {
    setBusy(true);
    try {
      await action();
      if (successKey) notify(successKey, { type: "success" });
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      const view = describeCommandError(code);
      notify(view.messageKey, {
        type: view.conflict ? "warning" : "error",
        messageArgs: { code },
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const closeDeal = (
    deal: Deal,
    reason: string,
    beforeDealId?: Identifier | null,
  ) =>
    run(async () => {
      let version = deal.version;
      if (deal.sales_id == null) {
        version = (await dataProvider.claimDeal(deal.id, version)).version;
      }
      await dataProvider.transitionDeal({
        dealId: deal.id,
        expectedVersion: version,
        toStage: "lost",
        beforeDealId,
        reason,
      });
    }, "crm.board.moved");

  const moveDeal = (deal: Deal, toStage: string, options: MoveOptions = {}) => {
    if (busy) return;
    const plan = planMove(deal, toStage, {
      sameColumnReorder: options.sameColumnReorder,
    });
    switch (plan.kind) {
      case "noop":
        return;
      case "blocked":
        notify(describeCommandError(plan.reason).messageKey, {
          type: "warning",
        });
        return;
      case "ask-reason":
        setPendingClose({ deal, beforeDealId: options.beforeDealId });
        return;
      case "release":
        void run(
          () =>
            dataProvider.assignDeal({
              dealId: deal.id,
              expectedVersion: deal.version,
              toSalesId: null,
            }),
          "crm.board.released",
        );
        return;
      case "claim":
        void run(
          () => dataProvider.claimDeal(deal.id, deal.version),
          "crm.board.taken",
        );
        return;
      case "claim-then-move":
        void run(async () => {
          const claimed = await dataProvider.claimDeal(deal.id, deal.version);
          await dataProvider.transitionDeal({
            dealId: deal.id,
            expectedVersion: claimed.version,
            toStage,
            beforeDealId: options.beforeDealId,
          });
        }, "crm.board.moved");
        return;
      case "move":
        void run(
          () =>
            dataProvider.transitionDeal({
              dealId: deal.id,
              expectedVersion: deal.version,
              toStage,
              beforeDealId: options.beforeDealId,
            }),
          options.sameColumnReorder ? undefined : "crm.board.moved",
        );
        return;
    }
  };

  const takeDeal = (deal: Deal) => {
    if (busy) return;
    void run(
      () => dataProvider.claimDeal(deal.id, deal.version),
      "crm.board.taken",
    );
  };

  const releaseDeal = (deal: Deal) => {
    if (busy) return;
    void run(
      () =>
        dataProvider.assignDeal({
          dealId: deal.id,
          expectedVersion: deal.version,
          toSalesId: null,
        }),
      "crm.board.released",
    );
  };

  const assignDeal = (deal: Deal, salesId: Identifier) => {
    if (busy) return;
    void run(
      () =>
        dataProvider.assignDeal({
          dealId: deal.id,
          expectedVersion: deal.version,
          toSalesId: salesId,
        }),
      "crm.board.assigned",
    );
  };

  const handoffDeal = (deal: Deal) => {
    if (busy) return;
    setPendingHandoff(deal);
  };

  const callDeal = (deal: Deal) => {
    if (busy) return;
    setPendingCall(deal);
  };

  const lostDialog = (
    <>
      <CallResultDialog
        deal={pendingCall}
        onClose={() => setPendingCall(null)}
      />
      <HandoffDialog
        deal={pendingHandoff}
        onClose={() => setPendingHandoff(null)}
      />
      <LostReasonDialog
        open={pendingClose != null}
        onCancel={() => setPendingClose(null)}
        onConfirm={(reason) => {
          const pending = pendingClose;
          setPendingClose(null);
          if (pending)
            void closeDeal(pending.deal, reason, pending.beforeDealId);
        }}
        title={translate("crm.lost_dialog.title")}
      />
    </>
  );

  return {
    moveDeal,
    takeDeal,
    releaseDeal,
    assignDeal,
    callDeal,
    handoffDeal,
    busy,
    lostDialog,
  };
};
