import {
  useGetList,
  useGetOne,
  useLocaleState,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import { formatRub, getBalanceView } from "../analytics/financeUtils";
import { useGetSalesName } from "../sales/useGetSalesName";
import type { DealFinanceRow, DealPayment } from "../types";
import { PaymentDialog, type PaymentKind } from "./PaymentDialog";

/** Money of the deal: amount, paid, balance and the history of payments and refunds. */
export const DealPayments = ({ dealId }: { dealId: Identifier }) => {
  const translate = useTranslate();
  const [kind, setKind] = useState<PaymentKind | null>(null);
  const { data: finance } = useGetOne<DealFinanceRow>("deals_finance", {
    id: dealId,
  });
  const { data: payments } = useGetList<DealPayment>("deal_payments", {
    filter: { deal_id: dealId },
    sort: { field: "id", order: "DESC" },
    pagination: { page: 1, perPage: 100 },
  });

  if (!finance) return null;
  const balance = getBalanceView(finance.balance);

  return (
    <section
      aria-label={translate("crm.payments.title")}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {translate("crm.payments.title")}
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setKind("payment")}
          >
            {translate("crm.payments.add_payment")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setKind("refund")}>
            {translate("crm.payments.add_refund")}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Fact
          label={translate("crm.payments.deal_amount")}
          value={
            finance.amount == null
              ? translate("crm.payments.unknown_amount")
              : formatRub(finance.amount)
          }
        />
        <Fact
          label={translate("crm.payments.paid")}
          value={formatRub(finance.paid)}
        />
        <Fact
          label={translate("crm.payments.balance")}
          value={
            balance.kind === "unknown"
              ? "—"
              : balance.kind === "overpaid"
                ? translate("crm.payments.overpaid", {
                    amount: formatRub(balance.value),
                  })
                : formatRub(balance.kind === "due" ? balance.value : 0)
          }
        />
      </div>
      {payments && payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.payments.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {(payments ?? []).map((payment) => (
            <PaymentRow key={payment.id} payment={payment} />
          ))}
        </ul>
      )}
      <PaymentDialog
        dealId={dealId}
        kind={kind}
        onClose={() => setKind(null)}
      />
    </section>
  );
};

const PaymentRow = ({ payment }: { payment: DealPayment }) => {
  const translate = useTranslate();
  const [locale = "ru"] = useLocaleState();
  const author = useGetSalesName(payment.created_by ?? undefined, {
    enabled: payment.created_by != null,
  });
  const sign = payment.kind === "refund" ? "−" : "+";
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span
        className={`font-medium ${payment.kind === "refund" ? "text-destructive" : ""}`}
      >
        {sign}
        {formatRub(payment.amount)}
      </span>
      <span>{translate(`crm.payments.kind.${payment.kind}`)}</span>
      <span className="text-xs text-muted-foreground">
        {new Date(`${payment.paid_at}T00:00:00`).toLocaleDateString(locale)}
        {author ? ` · ${translate("crm.payments.by", { name: author })}` : ""}
      </span>
      {payment.comment && (
        <span className="text-xs text-muted-foreground">
          «{payment.comment}»
        </span>
      )}
    </li>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm">{value}</span>
  </div>
);
