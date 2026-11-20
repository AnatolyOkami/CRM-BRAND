import {
  ListBase,
  useGetIdentity,
  useListContext,
  useTranslate,
} from "ra-core";
import { useEffect, useMemo, useState } from "react";
import { ListPagination } from "@/components/admin/list-pagination";

import { hasSalesRole, isSalesHead } from "../providers/commons/canAccess";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { FinanceFiltersBar } from "./FinanceFiltersBar";
import { FinanceSummaryCards } from "./FinanceSummaryCards";
import { FinanceTable } from "./FinanceTable";
import {
  emptyFinanceFilters,
  toListFilter,
  toSummaryArgs,
  type FinanceFilters,
} from "./financeUtils";

/** Sales analytics: the totals and the table of deals with their money, one selection for both. */
export const AnalyticsPage = () => {
  const translate = useTranslate();
  const { identity, isPending } = useGetIdentity();
  const { dealStages } = useConfigurationContext();
  const [filters, setFilters] = useState<FinanceFilters>(emptyFinanceFilters);

  const stageCodes = useMemo(
    () => dealStages.map((stage) => stage.value),
    [dealStages],
  );
  const listFilter = useMemo(
    () => toListFilter(filters, stageCodes),
    [filters, stageCodes],
  );
  const summaryArgs = useMemo(
    () => toSummaryArgs(filters, stageCodes),
    [filters, stageCodes],
  );

  if (isPending) return null;
  if (!hasSalesRole(identity?.roles)) {
    return (
      <p className="mt-8 text-center text-muted-foreground">
        {translate("ra.message.not_authorized", { _: "Access denied" })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {translate("crm.analytics.title")}
      </h1>
      <FinanceSummaryCards args={summaryArgs} />
      <FinanceFiltersBar
        filters={filters}
        onChange={setFilters}
        showOwner={isSalesHead(identity?.roles)}
      />
      <ListBase
        resource="deals_finance"
        perPage={25}
        sort={{ field: "expected_closing_date", order: "ASC" }}
        filter={listFilter}
        disableSyncWithLocation
        storeKey={false}
      >
        <BackToFirstPage filterKey={JSON.stringify(listFilter)} />
        <FinanceTable />
        <ListPagination rowsPerPageOptions={[10, 25, 50]} />
      </ListBase>
    </div>
  );
};

AnalyticsPage.path = "/analytics";

// A changed selection starts again from its first page
const BackToFirstPage = ({ filterKey }: { filterKey: string }) => {
  const { setPage } = useListContext();
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  return null;
};
