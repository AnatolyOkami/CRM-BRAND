import {
  useGetList,
  useLocaleState,
  useTranslate,
  type Identifier,
} from "ra-core";

import { formatCompanyDateTime, useCompanyTimeZone } from "../misc/companyTime";
import { OrderMaterials } from "../production/OrderMaterials";
import type { ProductionOrder } from "../types";

/** What the workshop does for this deal: status, instructions, due date, files and links. */
export const DealOrderBlock = ({ dealId }: { dealId: Identifier }) => {
  const translate = useTranslate();
  const [locale = "ru"] = useLocaleState();
  const timeZone = useCompanyTimeZone();
  const { data } = useGetList<ProductionOrder>("production_orders", {
    filter: { deal_id: dealId },
    pagination: { page: 1, perPage: 1 },
    sort: { field: "id", order: "ASC" },
  });
  const order = data?.[0];
  if (!order) return null;

  return (
    <section
      aria-label={translate("crm.order.block_title")}
      className="flex flex-col gap-3"
    >
      <h3 className="text-sm font-semibold">
        {translate("crm.order.block_title")} ·{" "}
        {translate("crm.order.number", { number: order.id })}
      </h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Fact
          label={translate("crm.order.status")}
          value={translate(`crm.order.stages.${order.stage}`)}
        />
        <Fact
          label={translate("crm.order.product")}
          value={order.product_name}
        />
        <Fact
          label={translate("crm.order.due_date")}
          value={order.due_date ?? translate("crm.order.no_due_date")}
        />
        {order.stage === "ready" && order.ready_at && (
          <Fact
            label=" "
            value={translate("crm.order.ready_at", {
              time: formatCompanyDateTime(order.ready_at, locale, timeZone),
            })}
          />
        )}
      </div>
      {order.instructions && (
        <div className="whitespace-pre-line text-sm">
          <span className="text-xs text-muted-foreground">
            {translate("crm.order.instructions")}
          </span>
          <p>{order.instructions}</p>
        </div>
      )}
      <OrderMaterials orderId={order.id} />
    </section>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm">{value}</span>
  </div>
);
