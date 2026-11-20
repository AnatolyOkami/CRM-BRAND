import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify } from "ra-core";
import { useState } from "react";

import { DealCommandError } from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import type { ProductionOrder } from "../types";
import { planOrderMove } from "./orderBoardUtils";

/**
 * Moves an order of the workshop with one server command. The board is reloaded afterwards
 * whatever the answer is, so that a lost race shows the real state.
 */
export const useOrderCommands = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const moveOrder = async (order: ProductionOrder, toStage: string) => {
    const plan = planOrderMove(order, toStage);
    if (plan.kind === "noop" || busy) return;
    setBusy(true);
    try {
      const result = await dataProvider.transitionOrder({
        orderId: order.id,
        expectedVersion: order.version,
        toStage: plan.toStage,
      });
      notify(
        result.notified
          ? "crm.production.ready_notified"
          : "crm.production.moved",
        { type: "success" },
      );
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      if (code === "order_version_conflict" || code === "order_not_found") {
        notify("crm.production.errors.conflict", { type: "warning" });
      } else if (code === "forbidden") {
        notify("crm.production.errors.forbidden", { type: "error" });
      } else {
        notify("crm.production.errors.generic", {
          type: "error",
          messageArgs: { code },
        });
      }
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["production_orders"] });
    }
  };

  return { moveOrder, busy };
};
