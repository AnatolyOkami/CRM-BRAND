import { useTranslate } from "ra-core";

import type { ProductionOrder } from "../types";

/** Compact state of an order for a board card: the workshop status and what comes with it. */
export const OrderIndicators = ({ order }: { order: ProductionOrder }) => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">
        {translate("crm.order.number", { number: order.id })}:{" "}
        {translate(`crm.order.stages.${order.stage}`)}
      </span>
      <span>
        {order.files_count > 0
          ? translate("crm.handoff.files_count", { count: order.files_count })
          : translate("crm.handoff.files_none")}
        {" · "}
        {order.links_count > 0
          ? translate("crm.handoff.links_count", { count: order.links_count })
          : translate("crm.handoff.links_none")}
      </span>
    </div>
  );
};
