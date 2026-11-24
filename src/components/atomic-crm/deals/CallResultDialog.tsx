import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  DealCommandError,
  newRequestKey,
} from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";
import { describeCommandError } from "./boardUtils";
import {
  defaultRecallAt,
  toRecallIso,
  validateCallResult,
} from "./callResultUtils";

/**
 * The manager records how the call went and what was agreed, and may put a call back on the
 * calendar. One request key per opening: a double click saves the call once.
 */
export const CallResultDialog = ({
  deal,
  onClose,
}: {
  deal: Deal | null;
  onClose: () => void;
}) => (
  <Dialog open={deal != null} onOpenChange={(isOpen) => !isOpen && onClose()}>
    <DialogContent className="max-h-9/10 overflow-y-auto">
      {deal && <CallResultForm deal={deal} onClose={onClose} />}
    </DialogContent>
  </Dialog>
);

const CallResultForm = ({
  deal,
  onClose,
}: {
  deal: Deal;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const requestKey = useRef(newRequestKey());

  const [result, setResult] = useState("");
  const [agreements, setAgreements] = useState("");
  const [recallEnabled, setRecallEnabled] = useState(true);
  const [recallAt, setRecallAt] = useState(() => defaultRecallAt());
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const values = { result, recallEnabled, recallAt };
  const errors = validateCallResult(values);

  const onSubmit = async () => {
    setTouched(true);
    if (Object.keys(errors).length > 0 || submitting) return;
    setSubmitting(true);
    try {
      await dataProvider.logCallResult({
        dealId: deal.id,
        result: result.trim(),
        agreements: agreements.trim() || undefined,
        recallAt: toRecallIso(values),
        requestKey: requestKey.current,
      });
      notify("crm.call_dialog.saved", { type: "success" });
      await Promise.all(
        ["deals", "deal_notes", "tasks", "deal_stage_history"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onClose();
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      const view = describeCommandError(code);
      notify(view.messageKey, {
        type: view.conflict ? "warning" : "error",
        messageArgs: { code },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{translate("crm.call_dialog.title")}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{deal.name}</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="call-result">
            {translate("crm.call_dialog.result")}
          </Label>
          <Textarea
            id="call-result"
            value={result}
            onChange={(event) => setResult(event.target.value)}
            placeholder={translate("crm.call_dialog.result_placeholder")}
            rows={3}
            autoFocus
            aria-invalid={touched && errors.result != null}
          />
          {touched && errors.result && (
            <p className="text-sm text-destructive">
              {translate(errors.result)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="call-agreements">
            {translate("crm.call_dialog.agreements")}
          </Label>
          <Textarea
            id="call-agreements"
            value={agreements}
            onChange={(event) => setAgreements(event.target.value)}
            placeholder={translate("crm.call_dialog.agreements_placeholder")}
            rows={2}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="call-recall"
              checked={recallEnabled}
              onCheckedChange={(checked) => setRecallEnabled(checked === true)}
            />
            <Label htmlFor="call-recall">
              {translate("crm.call_dialog.recall")}
            </Label>
          </div>
          {recallEnabled && (
            <>
              <Input
                id="call-recall-at"
                type="datetime-local"
                value={recallAt}
                onChange={(event) => setRecallAt(event.target.value)}
                aria-label={translate("crm.call_dialog.recall_at")}
                aria-invalid={touched && errors.recallAt != null}
              />
              {touched && errors.recallAt && (
                <p className="text-sm text-destructive">
                  {translate(errors.recallAt)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {translate("crm.call_dialog.cancel")}
        </Button>
        <Button disabled={submitting} onClick={() => void onSubmit()}>
          {translate("crm.call_dialog.save")}
        </Button>
      </DialogFooter>
    </>
  );
};
