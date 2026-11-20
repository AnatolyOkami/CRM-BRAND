import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDataProvider, useTranslate } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import type { FinanceSummaryArgs } from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import { formatRub } from "./financeUtils";

/**
 * Totals over the whole selection of the table: the server adds them up with the same filters and
 * the same rights, so they do not depend on the page that is shown.
 */
export const FinanceSummaryCards = ({ args }: { args: FinanceSummaryArgs }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { data, error } = useQuery({
    queryKey: ["deals_finance", "summary", args],
    queryFn: () => dataProvider.getFinanceSummary(args),
    placeholderData: keepPreviousData,
  });

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {translate("crm.analytics.table.error")}
      </p>
    );
  }

  const cards = [
    {
      key: "in_work",
      label: translate("crm.analytics.summary.in_work"),
      value: data ? String(data.in_work_count) : "…",
      note:
        data && data.in_work_without_amount > 0
          ? translate("crm.analytics.summary.without_amount", {
              count: data.in_work_without_amount,
            })
          : undefined,
    },
    {
      key: "amount",
      label: translate("crm.analytics.summary.in_work_amount"),
      value: data ? formatRub(data.in_work_amount) : "…",
    },
    {
      key: "paid",
      label: translate("crm.analytics.summary.paid"),
      value: data ? formatRub(data.paid) : "…",
    },
    {
      key: "remaining",
      label: translate("crm.analytics.summary.remaining"),
      value: data ? formatRub(data.remaining) : "…",
      note:
        data && data.overpaid > 0
          ? translate("crm.analytics.summary.overpaid", {
              amount: formatRub(data.overpaid),
            })
          : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.key} className="py-3">
            <CardContent className="flex flex-col gap-0.5 px-4">
              <span className="text-xs text-muted-foreground">
                {card.label}
              </span>
              <span
                className="text-2xl font-semibold"
                data-testid={`summary-${card.key}`}
              >
                {card.value}
              </span>
              {card.note && (
                <span className="text-xs text-muted-foreground">
                  {card.note}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate("crm.analytics.summary.hint")}
      </p>
    </div>
  );
};
