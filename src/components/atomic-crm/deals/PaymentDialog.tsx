import { useQueryClient } from "@tanstack/react-query";
import {
  useDataProvider,
  useNotify,
  useTranslate,
  type Identifier,
} from "ra-core";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  DealCommandError,
  newRequestKey,
} from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import { describeCommandError } from "./boardUtils";
import { toLocalInputValue } from "./manualDeal";

export type PaymentKind = "payment" | "refund";

/** Registers a payment or a refund of a deal. A refund is a separate operation, never an edit. */
export const PaymentDialog = ({
  dealId,
  kind,
  onClose,
}: {
  dealId: Identifier;
  kind: PaymentKind | null;
  onClose: () => void;
}) => (
  <Dialog open={kind != null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      {kind && <PaymentForm dealId={dealId} kind={kind} onClose={onClose} />}
    </DialogContent>
  </Dialog>
);

const PaymentForm = ({
  dealId,
  kind,
  onClose,
}: {
  dealId: Identifier;
  kind: PaymentKind;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  // One key for the dialog: a double click saves the operation once
  const requestKey = useRef(newRequestKey());
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() =>
    toLocalInputValue(new Date()).slice(0, 10),
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const value = Number(amount);
  const amountValid = Number.isInteger(value) && value > 0;

  const onSubmit = async () => {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    try {
      await dataProvider.registerPayment({
        dealId,
        kind,
        amount: value,
        paidAt,
        comment: comment.trim() || undefined,
        requestKey: requestKey.current,
      });
      notify("crm.payments.created", { type: "success" });
      await Promise.all(
        ["deal_payments", "deals_finance"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onClose();
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      const view = describeCommandError(code);
      notify(code === "unknown" ? "crm.payments.error" : view.messageKey, {
        type: "error",
        messageArgs: { code },
      });
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            kind === "payment"
              ? "crm.payments.add_payment"
              : "crm.payments.add_refund",
          )}
        </DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-amount">
            {translate("crm.payments.amount")}
          </Label>
          <Input
            id="payment-amount"
            inputMode="numeric"
            value={amount}
            aria-invalid={amount !== "" && !amountValid}
            onChange={(event) => setAmount(event.target.value.trim())}
          />
          {amount !== "" && !amountValid && (
            <p className="text-xs text-destructive">
              {translate("crm.board.errors.invalid_amount")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-date">{translate("crm.payments.date")}</Label>
          <Input
            id="payment-date"
            type="date"
            value={paidAt}
            max={toLocalInputValue(new Date()).slice(0, 10)}
            onChange={(event) => setPaidAt(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-comment">
            {translate("crm.payments.comment")}
          </Label>
          <Input
            id="payment-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          {translate("ra.action.cancel")}
        </Button>
        <Button
          onClick={() => void onSubmit()}
          disabled={!amountValid || submitting}
        >
          {translate("crm.payments.submit")}
        </Button>
      </DialogFooter>
    </>
  );
};
