import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDataProvider,
  useGetIdentity,
  useNotify,
  type Identifier,
} from "ra-core";

import { hasSalesRole } from "../providers/commons/canAccess";
import type { CrmDataProvider } from "../providers/types";
import type { NotificationEvent } from "../types";

export const NOTIFICATIONS_QUERY_KEY = ["notification_events", "pending"];

/** The notifications of the signed-in person that are not confirmed yet. */
export const usePendingNotifications = (): {
  enabled: boolean;
  notifications: NotificationEvent[];
} => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { identity } = useGetIdentity();
  const enabled = identity?.id != null && hasSalesRole(identity.roles);

  const { data } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => dataProvider.getPendingNotifications(),
    enabled,
    // The open CRM learns about a ready order by polling
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  return { enabled, notifications: data ?? [] };
};

/**
 * Confirmation of a notification. It disappears only after the server saved the confirmation;
 * on an error it stays and the person can try again.
 */
export const useConfirmNotification = (id: Identifier) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataProvider.acknowledgeNotification(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
    onError: () => notify("crm.notifications.confirm_error", { type: "error" }),
  });
};
