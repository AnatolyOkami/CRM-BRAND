import { useTranslate, type Identifier } from "ra-core";
import { Button } from "@/components/ui/button";

import {
  useConfirmNotification,
  usePendingNotifications,
} from "./useNotifications";

/**
 * Inside the card of a deal: while the card is open as a dialog the pinned panel cannot be used, so
 * the confirmation is offered here too. It appears only after the manager used "Open" in the panel.
 */
export const DealNotificationBanner = ({ dealId }: { dealId: Identifier }) => {
  const { notifications } = usePendingNotifications();
  const notification = notifications.find(
    (item) => item.deal_id === dealId && item.opened_at != null,
  );
  if (!notification) return null;
  return (
    <Banner id={notification.id} number={notification.payload.order_number} />
  );
};

const Banner = ({ id, number }: { id: Identifier; number: number }) => {
  const translate = useTranslate();
  const confirm = useConfirmNotification(id);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-muted p-3"
    >
      <span className="text-sm font-medium">
        {translate("crm.order.number", { number })}:{" "}
        {translate("crm.order.stages.ready")}
      </span>
      <Button
        size="sm"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate()}
      >
        {translate("crm.notifications.confirm")}
      </Button>
    </div>
  );
};
