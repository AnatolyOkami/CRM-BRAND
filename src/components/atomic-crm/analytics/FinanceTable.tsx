import { ArrowDown, ArrowUp } from "lucide-react";
import {
  useListContext,
  useLocaleState,
  useTranslate,
  type SortPayload,
} from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { findDealLabel } from "../deals/dealUtils";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { useGetSalesName } from "../sales/useGetSalesName";
import type { DealFinanceRow } from "../types";
import { formatRub, getBalanceView, getClosingDateView } from "./financeUtils";

/** The deals with their money. The closing date and the balance can be sorted. */
export const FinanceTable = () => {
  const translate = useTranslate();
  const { data, isPending, error, sort, setSort } =
    useListContext<DealFinanceRow>();

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {translate("crm.analytics.table.error")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{translate("crm.analytics.table.deal")}</TableHead>
          <TableHead>{translate("crm.analytics.table.stage")}</TableHead>
          <TableHead>{translate("crm.analytics.table.owner")}</TableHead>
          <SortableHead
            field="expected_closing_date"
            sort={sort}
            onSort={setSort}
            label={translate("crm.analytics.table.closing_date")}
          />
          <TableHead className="text-right">
            {translate("crm.analytics.table.amount")}
          </TableHead>
          <TableHead className="text-right">
            {translate("crm.analytics.table.paid")}
          </TableHead>
          <SortableHead
            field="balance"
            sort={sort}
            onSort={setSort}
            align="right"
            label={translate("crm.analytics.table.balance")}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {!isPending && data?.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={7}
              className="text-center text-muted-foreground"
            >
              {translate("crm.analytics.table.empty")}
            </TableCell>
          </TableRow>
        )}
        {(data ?? []).map((row) => (
          <FinanceRow key={row.id} row={row} />
        ))}
      </TableBody>
    </Table>
  );
};

const SortableHead = ({
  field,
  label,
  sort,
  onSort,
  align,
}: {
  field: string;
  label: string;
  sort: SortPayload;
  onSort: (sort: SortPayload) => void;
  align?: "right";
}) => {
  const active = sort.field === field;
  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active ? (sort.order === "ASC" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium"
        onClick={() =>
          onSort({
            field,
            order: active && sort.order === "ASC" ? "DESC" : "ASC",
          })
        }
      >
        {label}
        {active &&
          (sort.order === "ASC" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  );
};

const FinanceRow = ({ row }: { row: DealFinanceRow }) => {
  const translate = useTranslate();
  const [locale = "ru"] = useLocaleState();
  const { dealStages } = useConfigurationContext();
  const owner = useGetSalesName(row.sales_id ?? undefined, {
    enabled: row.sales_id != null,
  });
  const closing = getClosingDateView(row.stage, row.expected_closing_date);
  const balance = getBalanceView(row.balance);

  return (
    <TableRow>
      <TableCell className="max-w-64">
        <Link
          to={`/deals/${row.id}/show`}
          className="font-medium hover:underline"
        >
          {row.name}
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          {row.customer_name || "—"}
        </div>
      </TableCell>
      <TableCell>
        <div>{findDealLabel(dealStages, row.stage) ?? row.stage}</div>
        {row.order_stage && (
          <div className="text-xs text-muted-foreground">
            {translate("crm.analytics.table.workshop", {
              status: translate(`crm.order.stages.${row.order_stage}`),
            })}
            {row.order_due_date
              ? `, ${translate("crm.analytics.table.workshop_due", {
                  date: new Date(
                    `${row.order_due_date}T00:00:00`,
                  ).toLocaleDateString(locale),
                })}`
              : ""}
          </div>
        )}
      </TableCell>
      <TableCell>{row.sales_id == null ? "—" : owner}</TableCell>
      <TableCell>
        {closing.kind === "unassigned" ? (
          <span className="text-muted-foreground">
            {translate("crm.analytics.table.unassigned")}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {new Date(`${closing.date}T00:00:00`).toLocaleDateString(locale)}
            {closing.kind === "overdue" && (
              <Badge variant="destructive">
                {translate("crm.analytics.table.overdue")}
              </Badge>
            )}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {row.amount == null ? (
          <span className="text-muted-foreground">
            {translate("crm.analytics.table.not_specified")}
          </span>
        ) : (
          formatRub(row.amount)
        )}
      </TableCell>
      <TableCell className="text-right">{formatRub(row.paid)}</TableCell>
      <TableCell className="text-right">
        {balance.kind === "unknown" && "—"}
        {balance.kind === "due" && formatRub(balance.value)}
        {balance.kind === "settled" && formatRub(0)}
        {balance.kind === "overpaid" && (
          <span className="text-primary">
            {translate("crm.analytics.table.overpaid", {
              amount: formatRub(balance.value),
            })}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
};
