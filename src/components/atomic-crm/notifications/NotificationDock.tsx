import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify, useRedirect, useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import type { NotificationEvent } from "../types";
import {
  NOTIFICATIONS_QUERY_KEY,
  useConfirmNotification,
  usePendingNotifications,
} from "./useNotifications";

/**
 * Pinned panel in the bottom right corner: one card for every order that is ready and not yet
 * confirmed. It has no timer and no close button. The notifications come from the database, so they
 * are back after a reload or a new sign-in.
 */
export const NotificationDock = () => {
  const translate = useTranslate();
  const { enabled, notifications } = usePendingNotifications();

  if (!enabled || notifications.length === 0) return null;

  return (
    <aside
      role="region"
      aria-label={translate("crm.notifications.panel")}
      className="fixed right-4 bottom-4 z-50 flex max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto"
    >
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} />
      ))}
    </aside>
  );
};

const NotificationCard = ({
  notification,
}: {
  notification: NotificationEvent;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const translate = useTranslate();
  const notify = useNotify();
  const redirect = useRedirect();
  const queryClient = useQueryClient();

  const open = useMutation({
    mutationFn: () => dataProvider.openNotification(notification.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: NOTIFICATIONS_QUERY_KEY,
      });
      redirect(
        `/deals/${notification.deal_id}/show`,
        undefined,
        undefined,
        undefined,
        { _scrollToTop: false },
      );
    },
    onError: () => notify("crm.notifications.open_error", { type: "error" }),
  });
  const confirm = useConfirmNotification(notification.id);

  return (
    <div
      role="alert"
      className="rounded-lg border border-primary/40 bg-background p-3 shadow-lg"
    >
      <p className="text-sm font-medium">
        {translate("crm.notifications.order_ready", {
          number: notification.payload.order_number,
          customer: notification.payload.customer_name || "—",
        })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={open.isPending}
          onClick={() => open.mutate()}
        >
          {translate("crm.notifications.open")}
        </Button>
        {notification.opened_at != null && (
          <Button
            size="sm"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {translate("crm.notifications.confirm")}
          </Button>
        )}
      </div>
    </div>
  );
};
