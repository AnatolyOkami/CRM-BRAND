import { useTranslate } from "ra-core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ProductionOrder } from "../types";
import { OrderMaterials } from "./OrderMaterials";

/** Everything the workshop needs to make the order: instructions, due date, files and links. */
export const OrderDialog = ({
  order,
  onClose,
}: {
  order: ProductionOrder | null;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  return (
    <Dialog open={order != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-9/10 overflow-y-auto lg:max-w-2xl">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>
                {translate("crm.order.number", { number: order.id })} ·{" "}
                {order.product_name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Fact
                  label={translate("crm.production.customer")}
                  value={order.customer_name || "—"}
                />
                <Fact
                  label={translate("crm.order.status")}
                  value={translate(`crm.order.stages.${order.stage}`)}
                />
                <Fact
                  label={translate("crm.order.due_date")}
                  value={order.due_date ?? translate("crm.order.no_due_date")}
                />
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
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm">{value}</span>
  </div>
);
