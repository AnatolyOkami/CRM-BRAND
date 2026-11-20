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

/** Asks why a deal is closed without a sale: the reason is mandatory and stored with the deal. */
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
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setReason("");
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lost-reason">
            {translate("crm.lost_dialog.reason")}
          </Label>
          <Textarea
            id="lost-reason"
            value={reason}
            placeholder={translate("crm.lost_dialog.reason_placeholder")}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setReason("");
              onCancel();
            }}
          >
            {translate("crm.lost_dialog.cancel")}
          </Button>
          <Button
            disabled={trimmed.length === 0}
            onClick={() => {
              onConfirm(trimmed);
              setReason("");
            }}
          >
            {translate("crm.lost_dialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
