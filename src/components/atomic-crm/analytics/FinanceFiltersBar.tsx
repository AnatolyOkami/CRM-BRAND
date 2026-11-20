import { useGetList, useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { emptyFinanceFilters, type FinanceFilters } from "./financeUtils";

const selectClass =
  "h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Status, owner (only for the sales head) and the period of the planned closing. */
export const FinanceFiltersBar = ({
  filters,
  onChange,
  showOwner,
}: {
  filters: FinanceFilters;
  onChange: (filters: FinanceFilters) => void;
  showOwner: boolean;
}) => {
  const translate = useTranslate();
  const { dealStages } = useConfigurationContext();
  const { data: sales } = useGetList<{
    id: number;
    first_name: string;
    last_name: string;
  }>(
    "sales",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "last_name", order: "ASC" },
      filter: { "disabled@neq": true },
    },
    { enabled: showOwner },
  );
  const patch = (value: Partial<FinanceFilters>) =>
    onChange({ ...filters, ...value });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="finance-status">
          {translate("crm.analytics.filters.status")}
        </Label>
        <select
          id="finance-status"
          className={selectClass}
          value={filters.status}
          onChange={(event) => patch({ status: event.target.value })}
        >
          <option value="all">
            {translate("crm.analytics.filters.status_all")}
          </option>
          <option value="open">
            {translate("crm.analytics.filters.status_open")}
          </option>
          {dealStages.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </div>
      {showOwner && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="finance-owner">
            {translate("crm.analytics.filters.owner")}
          </Label>
          <select
            id="finance-owner"
            className={selectClass}
            value={filters.salesId ?? ""}
            onChange={(event) => patch({ salesId: event.target.value || null })}
          >
            <option value="">
              {translate("crm.analytics.filters.status_all")}
            </option>
            {(sales ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.first_name} {person.last_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="finance-from">
          {translate("crm.analytics.filters.closing_from")}
        </Label>
        <Input
          id="finance-from"
          type="date"
          className="w-44"
          value={filters.closingFrom}
          onChange={(event) => patch({ closingFrom: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="finance-to">
          {translate("crm.analytics.filters.closing_to")}
        </Label>
        <Input
          id="finance-to"
          type="date"
          className="w-44"
          value={filters.closingTo}
          onChange={(event) => patch({ closingTo: event.target.value })}
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(emptyFinanceFilters)}
      >
        {translate("crm.analytics.filters.reset")}
      </Button>
    </div>
  );
};
