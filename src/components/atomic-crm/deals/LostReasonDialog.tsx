import { useTranslate } from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  composeLostReason,
  isLostReasonComplete,
  LOST_REASONS,
  type LostReasonCode,
} from "./lostReasons";

/**
 * Asks why a deal is closed with a refusal: the reason is mandatory, picked from the typical ones,
 * with an optional comment, and stored with the deal.
 */
export const LostReasonDialog = ({
  open,
  title,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const [code, setCode] = useState<LostReasonCode | null>(null);
  const [comment, setComment] = useState("");

  const reset = () => {
    setCode(null);
    setComment("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label>{translate("crm.lost_dialog.reason")}</Label>
          <div className="flex flex-wrap gap-2" role="group">
            {LOST_REASONS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={code === value ? "default" : "outline"}
                aria-pressed={code === value}
                onClick={() => setCode(value)}
              >
                {translate(`crm.lost_dialog.reasons.${value}`)}
              </Button>
            ))}
          </div>
          <Label htmlFor="lost-comment">
            {translate("crm.lost_dialog.comment")}
          </Label>
          <Textarea
            id="lost-comment"
            value={comment}
            placeholder={translate("crm.lost_dialog.reason_placeholder")}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            {translate("crm.lost_dialog.cancel")}
          </Button>
          <Button
            disabled={!isLostReasonComplete(code, comment)}
            onClick={() => {
              if (code === null) return;
              onConfirm(
                composeLostReason(
                  translate(`crm.lost_dialog.reasons.${code}`),
                  comment,
                ),
              );
              reset();
            }}
          >
            {translate("crm.lost_dialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
